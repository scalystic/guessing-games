import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { encodeArtworkFromBuffer, ARTWORK_MIME } from '@/lib/audio/pipeline'
import { putObject, objectSize, isStorageConfigured } from '@/lib/storage'
import { prisma } from '@/lib/db'
import { buildSearchText, computeDecade } from '@/lib/catalog/search-text'
import { lookupItunes, guessSongTitle } from '@/lib/catalog/itunes'
import { detectHookStart } from '@/lib/catalog/detect-hook'
import axios from 'axios'
import { z } from 'zod'

const ImportBodySchema = z.object({
  videoId: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(300),
  seedPopularity: z.number().int().min(0).max(100).default(50),
  thumbnailUrl: z.string().url().optional(),
})

async function downloadThumbnail(thumbnailUrl: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(thumbnailUrl, {
    responseType: 'arraybuffer',
    timeout: 10_000,
  })
  return Buffer.from(response.data)
}

/**
 * POST /api/admin/youtube/import
 *
 * Saves a YouTube video's metadata (title, artist, videoId) into the database
 * so the game can stream it directly via the YouTube IFrame Player API.
 * No audio download, no ffmpeg, no S3 audio upload required.
 * Thumbnail is optionally uploaded as artwork.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return jsonError(400, 'invalid_json', 'Request body must be JSON.')
  }

  const parsed = ImportBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', 'Invalid request body.', parsed.error.flatten().fieldErrors)
  }

  const { videoId, title, artist, seedPopularity, thumbnailUrl } = parsed.data

  /// A song already in the catalog under `candidate`, ingested from some video
  /// other than this one. Re-importing the SAME video is allowed — the upsert
  /// path below handles that cleanly.
  async function findDuplicate(candidate: string) {
    return prisma.song.findFirst({
      where: {
        title: { equals: candidate, mode: 'insensitive' },
        puzzle: { NOT: { ingestRef: videoId } },
      },
      select: { puzzleId: true },
    })
  }

  // Cheap early-out before spending an iTunes lookup: both the raw video title
  // (what older imports stored) and the cleaned song name (what this route
  // stores now) are worth checking, so a re-run of a playlist skips songs it
  // already added instead of paying the rate-limit budget to rediscover them.
  const earlyDuplicate =
    (await findDuplicate(title)) ?? (await findDuplicate(guessSongTitle(title)))
  if (earlyDuplicate) {
    return jsonOk({ puzzleId: earlyDuplicate.puzzleId, alreadyExists: true })
  }

  // Run iTunes enrichment + silence detection in parallel for speed.
  const [itunes, hookStartMs] = await Promise.all([
    lookupItunes(title, artist),
    detectHookStart(videoId),
  ])

  // A lookup that never reached the store is not evidence the song is absent —
  // Apple answers 403 for a few minutes once a bulk import trips its rate
  // limit. Reporting it as retryable is the whole point of the distinction;
  // importing anyway would bake YouTube's messy title into the catalog for a
  // song that matches perfectly well on the next attempt.
  if (itunes.status === 'lookup_failed') {
    return jsonError(
      503,
      'itunes_unavailable',
      itunes.reason === 'rate_limited'
        ? 'iTunes rate-limited this lookup. Wait a minute and re-run the import — already-imported songs are skipped.'
        : 'Could not reach iTunes. Check the connection and re-run the import.',
    )
  }

  const matched = itunes.status === 'matched' ? itunes.track : null

  // Canonical store names when the store knew the song, so the catalog holds
  // "Maahi Ve" / "Udit Narayan" rather than the video title's
  // "Maahi Ve - Full Video | Shah Rukh Khan | … | Kal Ho Naa Ho". Without a
  // match, the cleaned video title is still far better than the raw one.
  const songTitle = matched?.trackName ?? guessSongTitle(title)
  const songArtist = matched?.artistName ?? artist
  const releaseYear = matched?.releaseYear ?? null
  const durationMs = matched?.durationMs ?? null
  const genres = matched?.genre ? [matched.genre] : []
  const album = matched?.collectionName ?? null
  const movie = matched?.movie ?? null

  // The store's name for the song is a third spelling the early-out never saw,
  // and it is the one that actually gets written — so two different uploads of
  // the same track only collapse into one row if it is checked too.
  if (songTitle.toLowerCase() !== title.toLowerCase()) {
    const canonicalDuplicate = await findDuplicate(songTitle)
    if (canonicalDuplicate) {
      return jsonOk({ puzzleId: canonicalDuplicate.puzzleId, alreadyExists: true })
    }
  }

  const game = await prisma.game.findUnique({
    where: { slug: 'songless' },
    select: { id: true },
  })
  if (!game) {
    return jsonError(500, 'game_not_found', 'Game "songless" not found. Run npm run db:seed.')
  }

  // Optionally download + encode + upload artwork (non-fatal if storage not configured)
  let artworkStorageKey: string | null = null
  let artworkByteSize: number | null = null
  let artworkChecksum: string | null = null

  if (thumbnailUrl && isStorageConfigured()) {
    try {
      const raw = await downloadThumbnail(thumbnailUrl)
      const artwork = await encodeArtworkFromBuffer(raw)
      const existingArt = await objectSize(artwork.storageKey)
      if (existingArt !== artwork.data.length) {
        await putObject(artwork.storageKey, artwork.data, {
          contentType: ARTWORK_MIME,
          sha256Hex: artwork.checksum,
        })
      }
      artworkStorageKey = artwork.storageKey
      artworkByteSize = artwork.data.length
      artworkChecksum = artwork.checksum
    } catch {
      // Artwork failure is non-fatal
    }
  }

  try {
    const decade = computeDecade(releaseYear ?? null)
    const searchText = buildSearchText(songTitle, songArtist)
    const ingestRef = videoId

    const puzzleId = await prisma.$transaction(async (tx) => {
      // Second title-duplicate check inside the transaction so that concurrent
      // imports of different videos with the same song title can't both slip
      // through the pre-check above and create two rows.
      const raceConditionDuplicate = await tx.song.findFirst({
        where: {
          title: { equals: songTitle, mode: 'insensitive' },
          puzzle: { NOT: { ingestRef: videoId } },
        },
        select: { puzzleId: true },
      })
      if (raceConditionDuplicate) return null

      const puzzle = await tx.puzzle.upsert({
        where: {
          gameId_ingestSource_ingestRef: {
            gameId: game.id,
            ingestSource: 'youtube',
            ingestRef,
          },
        },
        create: {
          gameId: game.id,
          popularity: seedPopularity,
          seedPopularity,
          licenseSource: 'youtube',
          ingestSource: 'youtube',
          ingestRef,
        },
        update: { seedPopularity, licenseSource: 'youtube' },
        select: { id: true },
      })

      await tx.song.upsert({
        where: { puzzleId: puzzle.id },
        create: {
          puzzleId: puzzle.id,
          title: songTitle,
          artist: songArtist,
          album: album ?? null,
          movie,
          releaseYear: releaseYear ?? null,
          decade,
          genres,
          durationMs: durationMs ?? null,
          hookStartMs,
          isrc: null,
          externalId: videoId,
          aliases: [],
          searchText,
        },
        update: {
          title: songTitle,
          artist: songArtist,
          album: album ?? null,
          movie,
          releaseYear: releaseYear ?? null,
          decade,
          genres,
          durationMs: durationMs ?? null,
          hookStartMs,
          externalId: videoId,
          searchText,
        },
      })

      if (artworkStorageKey && artworkByteSize && artworkChecksum) {
        await tx.puzzleAsset.upsert({
          where: { puzzleId_kind: { puzzleId: puzzle.id, kind: 'IMAGE' } },
          create: {
            puzzleId: puzzle.id,
            kind: 'IMAGE',
            storageKey: artworkStorageKey,
            mimeType: ARTWORK_MIME,
            durationMs: null,
            byteSize: artworkByteSize,
            checksum: artworkChecksum,
            stageByteOffsets: [],
          },
          update: {
            storageKey: artworkStorageKey,
            byteSize: artworkByteSize,
            checksum: artworkChecksum,
          },
        })
      }

      return puzzle.id
    })

    // null means the in-transaction duplicate check blocked the write.
    if (puzzleId === null) {
      return jsonOk({ puzzleId: null, alreadyExists: true })
    }

    // `itunes` lets the modal distinguish a fully enriched import from one that
    // went in on YouTube metadata alone, and flag a weak match for review,
    // rather than showing both as a bare tick.
    return jsonOk(
      {
        puzzleId,
        title: songTitle,
        artist: songArtist,
        itunes: matched
          ? { matched: true, lowConfidence: matched.lowConfidence }
          : { matched: false, lowConfidence: false },
      },
      { status: 201 },
    )
  } catch (error) {
    return internalErrorJson('youtube:import', error)
  }
}

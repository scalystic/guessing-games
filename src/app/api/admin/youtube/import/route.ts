import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { encodeArtworkFromBuffer, ARTWORK_MIME } from '@/lib/audio/pipeline'
import { putObject, objectSize, isStorageConfigured } from '@/lib/storage'
import { prisma } from '@/lib/db'
import { buildSearchText, computeDecade } from '@/lib/catalog/search-text'
import { searchItunes } from '@/lib/catalog/itunes'
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

  // Guard against duplicate titles from different sources. Allow re-import of
  // the same YouTube video (upsert path below handles that cleanly).
  const duplicateByTitle = await prisma.song.findFirst({
    where: {
      title: { equals: title, mode: 'insensitive' },
      puzzle: { NOT: { ingestRef: videoId } },
    },
    select: { puzzleId: true },
  })
  if (duplicateByTitle) {
    return jsonOk({ puzzleId: duplicateByTitle.puzzleId, alreadyExists: true })
  }

  // Run iTunes enrichment + silence detection in parallel for speed.
  const [itunesTrack, hookStartMs] = await Promise.all([
    searchItunes(title, artist),
    detectHookStart(videoId),
  ])

  // Require an iTunes match — skip songs not found in the official catalog.
  if (!itunesTrack) {
    return jsonOk({ puzzleId: null, skipped: true })
  }

  const releaseYear = itunesTrack.releaseYear
  const durationMs = itunesTrack.durationMs
  const genres = itunesTrack.genre ? [itunesTrack.genre] : []
  const album = itunesTrack.collectionName

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
    const searchText = buildSearchText(title, artist)
    const ingestRef = videoId

    const puzzleId = await prisma.$transaction(async (tx) => {
      // Second title-duplicate check inside the transaction so that concurrent
      // imports of different videos with the same song title can't both slip
      // through the pre-check above and create two rows.
      const raceConditionDuplicate = await tx.song.findFirst({
        where: {
          title: { equals: title, mode: 'insensitive' },
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
          title,
          artist,
          album: album ?? null,
          movie: null,
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
          title,
          artist,
          album: album ?? null,
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

    return jsonOk({ puzzleId }, { status: 201 })
  } catch (error) {
    return internalErrorJson('youtube:import', error)
  }
}

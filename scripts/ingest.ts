// Catalog ingest — master audio file in, playable Puzzle out.
//
//   npm run ingest -- --manifest ./ingest/sample.json --dry-run
//   npm run ingest -- --manifest ./ingest/sample.json
//
// Per track: cut a CLIP_WINDOW_MS window out of the master, normalise loudness,
// encode to a bare CBR MP3, walk its frames to find each stage's byte offset,
// upload it content-addressed, and upsert Puzzle + Song + PuzzleAsset.
//
// Idempotent. Re-running the same manifest re-cuts and re-uploads, but the
// Puzzle upsert is keyed on (gameId, ingestSource, ingestRef) so it updates in
// place. Retuning hookStartMs and re-running is the supported way to move a
// clip's start; telemetry on Puzzle (playCount, solveRate) is deliberately NOT
// touched by an update.
//
// ---------------------------------------------------------------------------
// Two things this pipeline can't fix, by design:
//
// 1. FADE-OUT. Every in-play stage is a byte-range PREFIX of this file, so it
//    ends wherever the range ends and a fade baked into the file can never
//    reach it. Every stage stops dead. The client must ramp gain down over the
//    last ~15ms of whatever it was served. Presentation, not content. (Only the
//    ?reveal=1 playback, which serves the whole object, reaches the file's own
//    end — and it plays out over the backup tail, so there is nothing abrupt
//    there to soften.)
//
// 2. ENCODER DELAY. LAME pads roughly 576 samples (~13ms) of silence at the
//    head, and with the Xing/LAME tag suppressed no decoder can compensate. The
//    10ms fade-in absorbs it visually, but stage 1 is effectively ~13ms shorter
//    than it reads. It is identical for every track, so it does not skew
//    difficulty between songs.
// ---------------------------------------------------------------------------

import 'dotenv/config'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { promisify } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { PrismaClient } from '../src/generated/prisma/client'
import { isStorageConfigured, objectSize, putObject } from '../src/lib/storage'
import { buildSearchText, computeDecade } from '../src/lib/catalog/search-text'
import { computeLadderOffsets } from './lib/mp3'
import { ARTWORK_EXTENSION, ARTWORK_MIME } from './lib/artwork'

const run = promisify(execFile)

// ---------------------------------------------------------------------------
// Encode settings
// ---------------------------------------------------------------------------

/// MP3, not AAC: a byte-prefix of an MP3 is a valid MP3 (self-describing frames,
/// no global index), which is the whole premise of serving stages as ranges.
/// Truncate an M4A and it will not decode.
const BITRATE_KBPS = 128
const SAMPLE_RATE = 44100
/// Mono. Nobody localises a 200ms clip, and it halves every byte we serve.
const CHANNELS = 1
const FADE_IN_SECONDS = 0.01

/// How much audio we CUT AND STORE per track, independent of how much the reveal
/// ladder can ever unlock.
///
/// The ladder tops out at 15s, so the last 15s of this is a backup tail that no
/// in-play stage can reach. Two things pay for it:
///
///   1. Retuning the ladder stops meaning a re-ingest. `npm run reslice` rescans
///      the stored frames and writes new offsets — but it can only ever point at
///      audio that is already in the bucket. When the stored clip ended exactly
///      at the last rung, ANY upward change to the ladder needed the masters
///      back, re-encoded and re-uploaded, for all 36 tracks. Now the ladder is a
///      genuine data tunable up to 30s.
///   2. The ?reveal=1 playback serves the whole object, so the result panel gets
///      30s of the song rather than the 15s the round could have unlocked.
///
/// Clamped per track to what the master actually has past hookStartMs — a hook
/// 20s from the end yields a shorter clip, not a failed ingest. Only dropping
/// below the last rung is fatal.
const CLIP_WINDOW_MS = 30_000

/// EBU R128 target. Consistency across the catalog matters more than the exact
/// number — stage 1 of one song has to be as audible as stage 1 of any other.
const LOUDNORM = { I: -16, TP: -1.5, LRA: 11 }

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const TrackSchema = z.object({
  /// Path to the master, relative to the manifest file.
  file: z.string().min(1),
  /// Pre-encoded square cover, relative to the manifest file. Written by
  /// `npm run metadata`; optional, because a puzzle is perfectly playable
  /// without art — the reveal just falls back to a generated gradient.
  artworkFile: z.string().nullish(),

  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().nullish(),
  /// The film this track is from, if any. Bare film title — `album` keeps the
  /// store's collection name, soundtrack qualifier and all. Left null for a
  /// single or a non-film album; `npm run metadata` only fills it when the
  /// store marked the track as a film track.
  movie: z.string().nullish(),
  releaseYear: z.number().int().min(1850).max(2100).nullish(),
  genres: z.array(z.string()).default([]),
  /// Accepted alternate titles for the typeahead.
  aliases: z.array(z.string()).default([]),

  /// Where the reveal ladder starts. Set past the intro so stage 1 lands on the
  /// hook rather than silence — one of only two difficulty levers there are.
  hookStartMs: z.number().int().min(0).default(0),
  /// 0-100 recognisability. A ranking within THIS catalog, not an absolute.
  seedPopularity: z.number().int().min(0).max(100),

  isrc: z.string().nullish(),
  externalId: z.string().nullish(),

  /// Provenance. Required, not optional: without it a per-track purge or a
  /// rights audit means guessing, and (ingestSource, ingestRef) is the upsert key.
  licenseSource: z.string().min(1),
  ingestSource: z.string().min(1),
  ingestRef: z.string().min(1),
})

const ManifestSchema = z.object({
  gameSlug: z.string().min(1).default('songless'),
  tracks: z.array(TrackSchema).min(1),
})

type Track = z.infer<typeof TrackSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ])
  const seconds = Number.parseFloat(stdout.trim())
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe gave no duration for ${file}`)
  return Math.round(seconds * 1000)
}

/// loudnorm reports what it MEASURED (input_*) and consumes what you tell it was
/// measured (measured_*). The names don't line up, so pass 2 renames these.
const LoudnessStatsSchema = z.object({
  input_i: z.string(),
  input_tp: z.string(),
  input_lra: z.string(),
  input_thresh: z.string(),
  target_offset: z.string(),
})

type LoudnessStats = z.infer<typeof LoudnessStatsSchema>

/// Pass 1 of loudnorm. Single-pass loudnorm adapts as it goes, which makes two
/// tracks land at different perceived levels; measuring first and applying a
/// fixed linear gain keeps the catalog coherent.
async function measureLoudness(
  file: string,
  startMs: number,
  durationMs: number,
): Promise<LoudnessStats | null> {
  const filter = `loudnorm=I=${LOUDNORM.I}:TP=${LOUDNORM.TP}:LRA=${LOUDNORM.LRA}:print_format=json`
  // loudnorm prints its JSON to stderr, and -f null means a zero exit with no output file.
  const { stderr } = await run('ffmpeg', [
    '-hide_banner', '-nostdin',
    '-i', file,
    '-ss', (startMs / 1000).toFixed(3),
    '-t', (durationMs / 1000).toFixed(3),
    '-af', filter,
    '-f', 'null', '-',
  ], { maxBuffer: 32 * 1024 * 1024 })

  const match = stderr.match(/\{[\s\S]*?\}/)
  if (!match) return null
  // Parsed strictly rather than cast: a silent shape change would feed
  // "measured_I=undefined" into pass 2 and fail the encode with no clue why.
  const parsed = LoudnessStatsSchema.safeParse(JSON.parse(match[0]))
  return parsed.success ? parsed.data : null
}

/// Pass 2: cut, normalise, fade in, encode. `-ss` sits AFTER `-i` so the seek is
/// sample-accurate — hookStartMs is a difficulty knob and must land where it says.
async function encodeClip(
  source: string,
  destination: string,
  startMs: number,
  durationMs: number,
  stats: LoudnessStats | null,
): Promise<void> {
  const seconds = durationMs / 1000

  const loudnorm = stats
    ? `loudnorm=I=${LOUDNORM.I}:TP=${LOUDNORM.TP}:LRA=${LOUDNORM.LRA}` +
      `:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}` +
      `:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}` +
      `:offset=${stats.target_offset}:linear=true:print_format=none`
    : `loudnorm=I=${LOUDNORM.I}:TP=${LOUDNORM.TP}:LRA=${LOUDNORM.LRA}:print_format=none`

  // Fade-in only. See the header note: a fade-out here would only reach stage 6.
  const filters = `${loudnorm},afade=t=in:st=0:d=${FADE_IN_SECONDS}`

  await run('ffmpeg', [
    '-hide_banner', '-nostdin', '-y',
    '-i', source,
    '-ss', (startMs / 1000).toFixed(3),
    '-t', seconds.toFixed(3),
    '-af', filters,
    '-ac', String(CHANNELS),
    '-ar', String(SAMPLE_RATE),
    '-c:a', 'libmp3lame',
    '-b:a', `${BITRATE_KBPS}k`,
    // A bare frame stream: no Xing/LAME header frame, no ID3, no cover art. Any
    // of those would sit before the audio and shift every stage offset, and the
    // Xing frame would also spend ~26ms of stage 1 on silence.
    '-write_xing', '0',
    '-id3v2_version', '0',
    '-map_metadata', '-1',
    '-vn',
    destination,
  ], { maxBuffer: 32 * 1024 * 1024 })
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Per-track pipeline
// ---------------------------------------------------------------------------

type Prepared = {
  track: Track
  clip: Buffer
  checksum: string
  storageKey: string
  stageByteOffsets: number[]
  actualMs: number[]
  /// Length of the STORED clip, backup tail included — not the last rung.
  durationMs: number
  /// What the ladder can actually unlock, for the ingest log. Equals the last
  /// entry of actualMs.
  playableMs: number
  /// Length of the source track, for Song.durationMs. Distinct from the clip's
  /// own durationMs on PuzzleAsset.
  masterMs: number
  /// Null when the manifest has no artworkFile for this track.
  artwork: PreparedArtwork | null
}

type PreparedArtwork = {
  data: Buffer
  checksum: string
  storageKey: string
}

/// Read the cover the metadata step already encoded, and key it by content.
///
/// Uploaded as-is, with no re-encoding: `npm run metadata` owns the format and
/// dimensions, and what sits on disk is exactly what a human reviewed. Doing the
/// conversion here as well would mean two places could disagree about what a
/// cover looks like.
async function prepareArtwork(path: string): Promise<PreparedArtwork> {
  const data = await readFile(path)
  const checksum = createHash('sha256').update(data).digest('hex')

  // Content-addressed for the same reason the audio is, and it matters just as
  // much: the cover IS the answer, so a key built from the title would give the
  // round away to anyone reading a URL.
  return { data, checksum, storageKey: `songless/artwork/${checksum}.${ARTWORK_EXTENSION}` }
}

async function prepare(
  track: Track,
  masterPath: string,
  artworkPath: string | null,
  ladder: number[],
  workDir: string,
): Promise<Prepared> {
  const playableWindowMs = ladder[ladder.length - 1]!

  const masterMs = await probeDurationMs(masterPath)
  const available = masterMs - track.hookStartMs

  // Short of the last rung is unplayable and therefore fatal. Short of the full
  // 30s only costs backup tail, so it degrades quietly — see CLIP_WINDOW_MS.
  if (available < playableWindowMs) {
    throw new Error(
      `hookStartMs ${track.hookStartMs} leaves ${available}ms of the ${masterMs}ms ` +
        `master, but the ladder needs ${playableWindowMs}ms — lower hookStartMs`,
    )
  }
  const windowMs = Math.min(CLIP_WINDOW_MS, available)

  const stats = await measureLoudness(masterPath, track.hookStartMs, windowMs)
  if (!stats) {
    console.warn(`    ! loudness measurement failed, falling back to single-pass`)
  }

  const outPath = join(workDir, `${track.ingestSource}-${track.ingestRef}.mp3`)
  await encodeClip(masterPath, outPath, track.hookStartMs, windowMs, stats)

  const encoded = await readFile(outPath)
  const { offsets, actualMs, totalMs, totalBytes } = computeLadderOffsets(encoded, ladder)

  // Trim to the last COMPLETE frame, not to the last ladder offset: everything
  // past the final rung is the backup tail and has to survive into the bucket.
  // libmp3lame's flush frame is partial and undecodable, so storing it would only
  // put bytes in the ?reveal=1 response that no decoder can use.
  const clip = encoded.subarray(0, totalBytes)

  // Content-addressed, and hashed AFTER the trim so the key identifies exactly
  // the bytes we serve. A key built from title/artist would leak the answer the
  // moment a URL reaches the client.
  const checksum = createHash('sha256').update(clip).digest('hex')

  return {
    track,
    clip,
    checksum,
    storageKey: `songless/clips/${checksum}.mp3`,
    stageByteOffsets: offsets,
    actualMs,
    // What the file actually holds, not what the ladder asked for. The reveal
    // serves the whole object, so this is the duration a player can hear.
    durationMs: Math.round(totalMs),
    playableMs: Math.round(actualMs[actualMs.length - 1]!),
    masterMs,
    artwork: artworkPath ? await prepareArtwork(artworkPath) : null,
  }
}

async function persist(
  prisma: PrismaClient,
  gameId: string,
  ladderRevision: number,
  prepared: Prepared,
): Promise<void> {
  const { track, clip, checksum, storageKey, stageByteOffsets, durationMs, masterMs, artwork } =
    prepared

  const songFields = {
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    movie: track.movie ?? null,
    releaseYear: track.releaseYear ?? null,
    decade: computeDecade(track.releaseYear),
    genres: track.genres,
    // The full track's length -- hint copy ("a 3:24 song from 1998") and a sanity
    // check on hookStartMs. Not the clip length; that lives on PuzzleAsset.
    durationMs: masterMs,
    hookStartMs: track.hookStartMs,
    isrc: track.isrc ?? null,
    externalId: track.externalId ?? null,
    aliases: track.aliases,
    searchText: buildSearchText(track.title, track.artist),
  }

  const assetFields = {
    kind: 'AUDIO_CLIP' as const,
    storageKey,
    mimeType: 'audio/mpeg',
    durationMs,
    byteSize: clip.length,
    checksum,
    stageByteOffsets,
    ladderRevision,
  }

  await prisma.$transaction(async (tx) => {
    // popularity is set from the seed on create but left alone on update:
    // telemetry retuning owns that column once a puzzle is live.
    const puzzle = await tx.puzzle.upsert({
      where: {
        gameId_ingestSource_ingestRef: {
          gameId,
          ingestSource: track.ingestSource,
          ingestRef: track.ingestRef,
        },
      },
      create: {
        gameId,
        popularity: track.seedPopularity,
        seedPopularity: track.seedPopularity,
        licenseSource: track.licenseSource,
        ingestSource: track.ingestSource,
        ingestRef: track.ingestRef,
      },
      update: {
        seedPopularity: track.seedPopularity,
        licenseSource: track.licenseSource,
      },
      select: { id: true },
    })

    await tx.song.upsert({
      where: { puzzleId: puzzle.id },
      create: { puzzleId: puzzle.id, ...songFields },
      update: songFields,
    })

    await tx.puzzleAsset.upsert({
      where: { puzzleId_kind: { puzzleId: puzzle.id, kind: 'AUDIO_CLIP' } },
      create: { puzzleId: puzzle.id, ...assetFields },
      update: assetFields,
    })

    if (artwork) {
      // stageByteOffsets stays empty and ladderRevision keeps its default: both
      // describe the reveal ladder, which an image has no part in. The cover is
      // all-or-nothing, served once the round is already resolved.
      const imageFields = {
        kind: 'IMAGE' as const,
        storageKey: artwork.storageKey,
        mimeType: ARTWORK_MIME,
        durationMs: null,
        byteSize: artwork.data.length,
        checksum: artwork.checksum,
        stageByteOffsets: [],
      }

      await tx.puzzleAsset.upsert({
        where: { puzzleId_kind: { puzzleId: puzzle.id, kind: 'IMAGE' } },
        create: { puzzleId: puzzle.id, ...imageFields },
        update: imageFields,
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      /// Write metadata, skip the upload. Keys are content-addressed, so
      /// re-running a manifest to fix a title or retune seedPopularity would
      /// otherwise re-PUT bytes that are already in the bucket unchanged.
      'skip-upload': { type: 'boolean', default: false },
      'out-dir': { type: 'string' },
    },
  })

  if (!values.manifest) {
    console.error(
      'usage: npm run ingest -- --manifest <path> [--dry-run] [--skip-upload] [--out-dir <dir>]',
    )
    process.exit(1)
  }

  const dryRun = values['dry-run']
  const skipUpload = values['skip-upload'] || dryRun
  const manifestPath = resolve(values.manifest)
  const manifestDir = join(manifestPath, '..')

  const manifest = ManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  )

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  const game = await prisma.game.findUnique({
    where: { slug: manifest.gameSlug },
    select: { id: true, maxAttempts: true, revealLadder: true, ladderRevision: true },
  })
  if (!game) throw new Error(`no game with slug "${manifest.gameSlug}" — run npm run db:seed`)

  const ladder = game.revealLadder as number[]
  if (!Array.isArray(ladder) || ladder.length !== game.maxAttempts) {
    throw new Error(
      `revealLadder has ${Array.isArray(ladder) ? ladder.length : '?'} stages but ` +
        `maxAttempts is ${game.maxAttempts}`,
    )
  }

  // Caught here rather than per track, because it is a config mistake and not a
  // property of any one master: every single track would fail the same way.
  const lastRung = ladder[ladder.length - 1]!
  if (lastRung > CLIP_WINDOW_MS) {
    throw new Error(
      `revealLadder tops out at ${lastRung}ms but the clip window is only ` +
        `${CLIP_WINDOW_MS}ms — raise CLIP_WINDOW_MS in this script`,
    )
  }

  if (!skipUpload && !isStorageConfigured()) {
    throw new Error(
      'object storage is not configured — set S3_ENDPOINT / S3_BUCKET / ' +
        'S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY, or pass --skip-upload',
    )
  }
  const outDir = values['out-dir'] ? resolve(values['out-dir']) : null
  if (outDir) await mkdir(outDir, { recursive: true })

  const workDir = await mkdtemp(join(tmpdir(), 'songless-ingest-'))

  console.log(
    `${manifest.gameSlug}: ${manifest.tracks.length} track(s), ` +
      `${CLIP_WINDOW_MS / 1000}s clip window, ` +
      `ladder [${ladder.join(', ')}]ms, rev ${game.ladderRevision}` +
      (dryRun ? '  (DRY RUN — no upload, no writes)' : skipUpload ? '  (metadata only — no upload)' : ''),
  )

  let ok = 0
  const failures: string[] = []

  try {
    for (const track of manifest.tracks) {
      const label = `${track.artist} — ${track.title}`
      try {
        const masterPath = resolve(manifestDir, track.file)
        const artworkPath = track.artworkFile ? resolve(manifestDir, track.artworkFile) : null
        const prepared = await prepare(track, masterPath, artworkPath, ladder, workDir)

        if (outDir) {
          await writeFile(join(outDir, basename(prepared.storageKey)), prepared.clip)
        }

        // Keys are a hash of the bytes, so an object that already exists at this
        // key is byte-identical by construction. Nothing to re-upload.
        let uploaded = 'skipped (unchanged)'
        if (!skipUpload) {
          const existing = await objectSize(prepared.storageKey)
          if (existing === prepared.clip.length) {
            uploaded = 'already present'
          } else {
            await putObject(prepared.storageKey, prepared.clip, {
              contentType: 'audio/mpeg',
              sha256Hex: prepared.checksum,
            })
            uploaded = 'uploaded'
          }

          if (prepared.artwork) {
            const art = prepared.artwork
            const existingArt = await objectSize(art.storageKey)
            if (existingArt !== art.data.length) {
              await putObject(art.storageKey, art.data, {
                contentType: ARTWORK_MIME,
                sha256Hex: art.checksum,
              })
            }
          }
        }

        if (!dryRun) {
          await persist(prisma, game.id, game.ladderRevision, prepared)
        }

        const stages = prepared.stageByteOffsets
          .map((byte, i) => `${prepared.actualMs[i]!.toFixed(0)}ms/${byte}B`)
          .join('  ')
        const art = prepared.artwork
          ? `art ${Math.round(prepared.artwork.data.length / 1024)}KB`
          : 'art none'
        // Flag a clamped window: the tail is thinner than CLIP_WINDOW_MS asked
        // for, which is legal but worth seeing in the log.
        const backupMs = prepared.durationMs - prepared.playableMs
        const clamped = prepared.durationMs < CLIP_WINDOW_MS - 100 ? ' CLAMPED' : ''
        console.log(`  ok  ${label}  [${uploaded}]`)
        console.log(
          `      pop ${track.seedPopularity} · ${prepared.clip.length}B · ` +
            `${(prepared.durationMs / 1000).toFixed(1)}s stored ` +
            `(${(prepared.playableMs / 1000).toFixed(1)}s playable + ` +
            `${(backupMs / 1000).toFixed(1)}s backup${clamped}) · ${art}`,
        )
        console.log(`      ${stages}`)
        ok++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`  ERR ${label}\n      ${message}`)
        failures.push(label)
      }
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
    await prisma.$disconnect()
  }

  console.log(`\n${ok} ingested, ${failures.length} failed`)
  if (failures.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

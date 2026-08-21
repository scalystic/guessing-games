// Catalog ingest — master audio file in, playable Puzzle out.
//
//   npm run ingest -- --manifest ./ingest/sample.json --dry-run
//   npm run ingest -- --manifest ./ingest/sample.json
//
// Per track: cut the reveal window out of the master, normalise loudness, encode
// to a bare CBR MP3, walk its frames to find each stage's byte offset, upload it
// content-addressed, and upsert Puzzle + Song + PuzzleAsset.
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
// 1. FADE-OUT. Stages 1-5 are byte-range PREFIXES of this file, so they end
//    wherever the range ends — a fade baked into the file only ever softens
//    stage 6. Every earlier stage stops dead. The client must ramp gain down
//    over the last ~15ms of whatever it was served. Presentation, not content.
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
// Shared with the search endpoint on purpose: the index this writes and the
// queries that read it have to normalise identically, and a second copy of the
// transform drifts silently.
import { buildSearchText } from '../src/lib/game/search-text'
import { computeLadderOffsets } from './lib/mp3'

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

/// EBU R128 target. Consistency across the catalog matters more than the exact
/// number — stage 1 of one song has to be as audible as stage 1 of any other.
const LOUDNORM = { I: -16, TP: -1.5, LRA: 11 }

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const TrackSchema = z.object({
  /// Path to the master, relative to the manifest file.
  file: z.string().min(1),

  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().nullish(),
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
  durationMs: number
  /// Length of the source track, for Song.durationMs. Distinct from the clip's
  /// own durationMs on PuzzleAsset.
  masterMs: number
}

async function prepare(
  track: Track,
  masterPath: string,
  ladder: number[],
  workDir: string,
): Promise<Prepared> {
  const windowMs = ladder[ladder.length - 1]!

  const masterMs = await probeDurationMs(masterPath)
  if (track.hookStartMs + windowMs > masterMs) {
    throw new Error(
      `hookStartMs ${track.hookStartMs} + ${windowMs}ms window exceeds the ` +
        `${masterMs}ms master — lower hookStartMs`,
    )
  }

  const stats = await measureLoudness(masterPath, track.hookStartMs, windowMs)
  if (!stats) {
    console.warn(`    ! loudness measurement failed, falling back to single-pass`)
  }

  const outPath = join(workDir, `${track.ingestSource}-${track.ingestRef}.mp3`)
  await encodeClip(masterPath, outPath, track.hookStartMs, windowMs, stats)

  const encoded = await readFile(outPath)
  const { offsets, actualMs } = computeLadderOffsets(encoded, ladder)

  // Trim the encoder's flush frame. libmp3lame emits one frame past the requested
  // duration, and storing it would mean stage 6 serves ~26ms that the ladder never
  // asked for while byteSize disagreed with the final offset.
  const lastOffset = offsets[offsets.length - 1]!
  const clip = encoded.subarray(0, lastOffset)

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
    // What the file actually holds, not what the ladder asked for.
    durationMs: Math.round(actualMs[actualMs.length - 1]!),
    masterMs,
  }
}

async function persist(
  prisma: PrismaClient,
  gameId: string,
  ladderRevision: number,
  prepared: Prepared,
): Promise<void> {
  const { track, clip, checksum, storageKey, stageByteOffsets, durationMs, masterMs } =
    prepared

  const songFields = {
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    releaseYear: track.releaseYear ?? null,
    decade: track.releaseYear ? Math.floor(track.releaseYear / 10) * 10 : null,
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
        const prepared = await prepare(track, masterPath, ladder, workDir)

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
        }

        if (!dryRun) {
          await persist(prisma, game.id, game.ladderRevision, prepared)
        }

        const stages = prepared.stageByteOffsets
          .map((byte, i) => `${prepared.actualMs[i]!.toFixed(0)}ms/${byte}B`)
          .join('  ')
        console.log(`  ok  ${label}  [${uploaded}]`)
        console.log(`      pop ${track.seedPopularity} · ${prepared.clip.length}B · ${stages}`)
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

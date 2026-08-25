// hookStartMs detection — find where each master reaches full energy.
//
//   npm run hooks -- --manifest ./ingest/manifest.json
//   npm run hooks -- --manifest ./ingest/manifest.json --write
//
// Stage 1 of a round is 400ms. Left at hookStartMs=0 that lands on an intro pad
// or dead air and the round is unplayable for everyone, so every track needs a
// start point past the intro. Scrubbing a catalog by hand is the accurate way;
// this is the first pass that makes the hand pass cheap.
//
// The heuristic: measure momentary loudness (EBU R128 "M", a 400ms window) every
// 100ms, take a high percentile as the track's "full energy" reference, and
// return the earliest point from which the track SUSTAINS that level. Intros,
// ambient pads and solo-instrument openings sit below it; the first verse or
// chorus with a full arrangement sits at it.
//
// This finds full arrangement, NOT the vocal hook — they usually coincide, but a
// track with a loud instrumental break before the vocal will land on the break.
// That is why --write also exports a named 15s preview per track: the output is a
// draft to listen to and correct, not a final answer.

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { z } from 'zod'

const run = promisify(execFile)

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/// ebur128 emits one momentary reading per 100ms. Not configurable in the filter.
const FRAME_MS = 100

/// The PLAYABLE window every stage is a prefix of. Must match the last rung of
/// the game's revealLadder, and bounds how late a hook can start.
///
/// Deliberately the ladder's 15s and not ingest's 30s CLIP_WINDOW_MS. The stored
/// clip is longer than this, but the extra is a backup tail the player never
/// hears in play, and ingest clamps it per track — so it must not constrain where
/// the hook goes, and energy held across it says nothing about playability.
const WINDOW_MS = 15000

/// "Full energy" reference. A high percentile rather than the max, so one clipped
/// transient or a single loud snare hit can't define the whole track's level.
const REFERENCE_PERCENTILE = 0.95

/// How far below the reference still counts as full energy. Tight enough to reject
/// an intro pad, loose enough not to demand the single loudest bar of the chorus.
const TOLERANCE_LU = 2.5

/// How long the level has to hold before the point counts as the hook. Shorter
/// than this and a single loud fill in an otherwise quiet intro would win.
const SUSTAIN_MS = 3000

/// Fraction of frames within the sustain window that must clear the threshold.
/// Not 100%: real music dips between phrases, and a strict run breaks on every
/// downbeat rest.
const SUSTAIN_RATIO = 0.8

/// Below this, a reading is silence or near-silence rather than quiet music.
/// ebur128 reports about -120 LUFS for digital black.
const SILENCE_LUFS = -70

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/// Deliberately loose: this tool only reads `file` and writes `hookStartMs`, and
/// validating the rest here would mean a second copy of the ingest schema to keep
/// in sync. `npm run ingest -- --dry-run` is what validates a manifest properly.
const TrackSchema = z
  .object({
    file: z.string().min(1),
    title: z.string().default('?'),
    artist: z.string().default('?'),
    ingestRef: z.string().min(1),
    hookStartMs: z.number().int().min(0).default(0),
  })
  .loose()

const ManifestSchema = z.object({ tracks: z.array(TrackSchema).min(1) }).loose()

type Track = z.infer<typeof TrackSchema>

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/// Momentary loudness every 100ms, in LUFS, for the whole file.
///
/// `-map 0:a` matters: most of these masters carry attached cover art as a video
/// stream, and without it ffmpeg tries to feed the PNG through the audio filter.
async function momentaryLoudness(file: string): Promise<number[]> {
  const { stdout } = await run(
    'ffmpeg',
    [
      '-hide_banner', '-nostdin',
      '-i', file,
      '-map', '0:a',
      '-af', 'ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-',
      '-f', 'null', '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  )

  const values: number[] = []
  for (const line of stdout.split('\n')) {
    const match = line.match(/^lavfi\.r128\.M=(-?[\d.]+)/)
    if (match) values.push(Number.parseFloat(match[1]!))
  }
  return values
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  return sorted[index]!
}

type Detection = {
  hookStartMs: number
  /// Reference level the threshold was derived from.
  referenceLufs: number
  /// Share of the full 15s window from the chosen point that clears the threshold.
  ///
  /// Measured over the whole window rather than the sustain probe on purpose: the
  /// probe's own coverage is always exactly SUSTAIN_RATIO at the point it first
  /// crosses, so reporting that would print the same number for every track. Over
  /// the window it varies, and a low value means the clip drops out of energy part
  /// way through — the signal worth reviewing.
  coverage: number
  /// Set when the result is a fallback rather than a real detection.
  warning: string | null
}

function detect(loudness: number[], masterMs: number): Detection {
  /// A hook cannot start so late that the playable window runs past the end.
  const latestStartMs = Math.max(0, masterMs - WINDOW_MS)

  const music = loudness.filter((v) => v > SILENCE_LUFS)
  if (music.length === 0) {
    return { hookStartMs: 0, referenceLufs: Number.NaN, coverage: 0, warning: 'silent track' }
  }

  const reference = percentile([...music].sort((a, b) => a - b), REFERENCE_PERCENTILE)
  const threshold = reference - TOLERANCE_LU

  const sustainFrames = Math.round(SUSTAIN_MS / FRAME_MS)
  const lastIndex = Math.floor(latestStartMs / FRAME_MS)

  /// Share of the served window that holds the level, from a given start.
  const windowCoverage = (start: number): number => {
    const frames = Math.min(Math.round(WINDOW_MS / FRAME_MS), loudness.length - start)
    if (frames <= 0) return 0
    let count = 0
    for (let i = start; i < start + frames; i++) {
      if (loudness[i]! >= threshold) count++
    }
    return count / frames
  }

  // Rolling count of frames over the threshold, so this stays linear rather than
  // re-summing a 30-frame window at every offset.
  let over = 0
  for (let i = 0; i < Math.min(sustainFrames, loudness.length); i++) {
    if (loudness[i]! >= threshold) over++
  }

  for (let start = 0; start <= lastIndex; start++) {
    const end = start + sustainFrames
    if (end > loudness.length) break

    if (over / sustainFrames >= SUSTAIN_RATIO) {
      return {
        hookStartMs: start * FRAME_MS,
        referenceLufs: reference,
        coverage: windowCoverage(start),
        warning: null,
      }
    }

    if (loudness[start]! >= threshold) over--
    if (loudness[end]! >= threshold) over++
  }

  // Nothing sustained the level in time. Rather than fall back to 0 — the one
  // value we know is wrong — start where the loudest single frame is.
  let peakIndex = 0
  for (let i = 0; i <= lastIndex && i < loudness.length; i++) {
    if (loudness[i]! > loudness[peakIndex]!) peakIndex = i
  }
  const fallbackStart = Math.min(peakIndex, Math.floor(latestStartMs / FRAME_MS))
  return {
    hookStartMs: fallbackStart * FRAME_MS,
    referenceLufs: reference,
    coverage: windowCoverage(fallbackStart),
    warning: 'no sustained full-energy region — fell back to loudest frame',
  }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/// A listenable copy of the playable window, named by ingestRef.
///
/// Deliberately NOT the bare headerless stream the ingest produces: that file is
/// shaped for byte-range serving and named by content hash, which is unreviewable.
/// This one keeps its headers so any player handles it, and stage 1 is simply its
/// first 400ms.
async function writePreview(
  source: string,
  destination: string,
  startMs: number,
): Promise<void> {
  await run(
    'ffmpeg',
    [
      '-hide_banner', '-nostdin', '-y',
      '-i', source,
      '-map', '0:a',
      '-ss', (startMs / 1000).toFixed(3),
      '-t', (WINDOW_MS / 1000).toFixed(3),
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none,afade=t=in:st=0:d=0.01',
      '-ac', '1', '-ar', '44100',
      '-c:a', 'libmp3lame', '-b:a', '128k',
      '-map_metadata', '-1', '-vn',
      destination,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  )
}

async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ])
  return Math.round(Number.parseFloat(stdout.trim()) * 1000)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      /// Off by default: this overwrites hookStartMs, including values that were
      /// tuned by hand on an earlier pass.
      write: { type: 'boolean', default: false },
      /// Skip tracks that already have a non-zero hookStartMs, so a re-run after
      /// hand-correcting a few doesn't undo the corrections.
      'only-unset': { type: 'boolean', default: false },
      'out-dir': { type: 'string' },
      'no-preview': { type: 'boolean', default: false },
    },
  })

  if (!values.manifest) {
    console.error(
      'usage: npm run hooks -- --manifest <path> [--write] [--only-unset] ' +
        '[--out-dir <dir>] [--no-preview]',
    )
    process.exit(1)
  }

  const manifestPath = resolve(values.manifest)
  const manifestDir = join(manifestPath, '..')
  const raw = JSON.parse(await readFile(manifestPath, 'utf8'))
  const manifest = ManifestSchema.parse(raw)

  const outDir = resolve(values['out-dir'] ?? join(manifestDir, 'out'))
  const wantPreviews = values.write && !values['no-preview']
  if (wantPreviews) await mkdir(outDir, { recursive: true })

  console.log(
    `${manifest.tracks.length} track(s)  ref p${REFERENCE_PERCENTILE * 100} ` +
      `-${TOLERANCE_LU}LU  sustain ${SUSTAIN_MS}ms@${SUSTAIN_RATIO * 100}%` +
      (values.write ? '' : '  (read-only — pass --write to apply)'),
  )

  const warnings: string[] = []
  let changed = 0

  for (const track of manifest.tracks as Track[]) {
    const label = `${track.artist} — ${track.title}`
    const masterPath = resolve(manifestDir, track.file)

    if (values['only-unset'] && track.hookStartMs > 0) {
      console.log(`  --  ${label}\n      kept ${formatMs(track.hookStartMs)} (already set)`)
      continue
    }

    try {
      const masterMs = await probeDurationMs(masterPath)
      const loudness = await momentaryLoudness(masterPath)
      const result = detect(loudness, masterMs)

      if (values.write) {
        // Mutating the parsed object in place would drop any manifest field this
        // tool's loose schema didn't name, so edit the raw JSON instead.
        const entry = raw.tracks.find((t: Track) => t.ingestRef === track.ingestRef)
        if (entry) entry.hookStartMs = result.hookStartMs
        if (wantPreviews) {
          await writePreview(masterPath, join(outDir, `${track.ingestRef}.mp3`), result.hookStartMs)
        }
      }

      if (result.hookStartMs !== track.hookStartMs) changed++

      const pct = ((result.hookStartMs / masterMs) * 100).toFixed(0)
      console.log(`  ok  ${label}`)
      console.log(
        `      ${formatMs(result.hookStartMs)} (${result.hookStartMs}ms, ${pct}% in)  ` +
          `ref ${result.referenceLufs.toFixed(1)} LUFS  ` +
          `coverage ${(result.coverage * 100).toFixed(0)}%`,
      )
      if (result.warning) {
        console.log(`      ! ${result.warning}`)
        warnings.push(`${track.ingestRef}: ${result.warning}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  ERR ${label}\n      ${message}`)
      warnings.push(`${track.ingestRef}: ${message}`)
    }
  }

  if (values.write) {
    await writeFile(manifestPath, `${JSON.stringify(raw, null, 2)}\n`)
    console.log(`\n${changed} hookStartMs updated in ${values.manifest}`)
    if (wantPreviews) console.log(`15s previews in ${outDir} — listen, then hand-correct outliers`)
  } else {
    console.log(`\n${changed} would change. Re-run with --write to apply.`)
  }

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} need attention:`)
    for (const warning of warnings) console.log(`  ${warning}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

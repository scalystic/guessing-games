import 'server-only'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import sharp from 'sharp'

const run = promisify(execFile)

// Must match scripts/ingest.ts
const BITRATE_KBPS = 128
const SAMPLE_RATE = 44100
const CHANNELS = 1
const FADE_IN_SECONDS = 0.01
export const CLIP_WINDOW_MS = 30_000
const LOUDNORM = { I: -16, TP: -1.5, LRA: 11 }
export const ARTWORK_MIME = 'image/webp'
export const ARTWORK_EXTENSION = 'webp'

// ---------------------------------------------------------------------------
// MP3 frame walker (mirrors scripts/lib/mp3.ts)
// ---------------------------------------------------------------------------

const BITRATES_KBPS_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BITRATES_KBPS_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]

const SAMPLE_RATES: Record<number, readonly number[]> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
}
const SAMPLES_PER_FRAME: Record<number, number> = { 1: 1152, 2: 576, 2.5: 576 }
const SIZE_COEFFICIENT: Record<number, number> = { 1: 144, 2: 72, 2.5: 72 }

function id3v2Length(buf: Buffer): number {
  if (buf.length < 10) return 0
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0
  const size = (buf[6]! << 21) | (buf[7]! << 14) | (buf[8]! << 7) | buf[9]!
  const footer = (buf[5]! & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

type Frame = { offset: number; end: number; durationMs: number }

function parseFrameHeader(buf: Buffer, at: number): Frame | null {
  if (at + 4 > buf.length) return null
  const b0 = buf[at]!
  const b1 = buf[at + 1]!
  const b2 = buf[at + 2]!
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null
  const versionBits = (b1 >> 3) & 0b11
  const version: number | null =
    versionBits === 0b11 ? 1 : versionBits === 0b10 ? 2 : versionBits === 0b00 ? 2.5 : null
  if (version === null) return null
  if (((b1 >> 1) & 0b11) !== 0b01) return null
  const bitrateIndex = (b2 >> 4) & 0b1111
  const table = version === 1 ? BITRATES_KBPS_V1_L3 : BITRATES_KBPS_V2_L3
  const bitrateKbps = table[bitrateIndex]!
  if (bitrateKbps === 0) return null
  const sampleRateIndex = (b2 >> 2) & 0b11
  const sampleRate = SAMPLE_RATES[version]?.[sampleRateIndex]
  if (sampleRate === undefined) return null
  const padding = (b2 >> 1) & 0b1
  const length = Math.floor((SIZE_COEFFICIENT[version]! * bitrateKbps * 1000) / sampleRate) + padding
  if (length < 4 || at + length > buf.length) return null
  return { offset: at, end: at + length, durationMs: (SAMPLES_PER_FRAME[version]! / sampleRate) * 1000 }
}

function computeLadderOffsets(
  buf: Buffer,
  ladderMs: number[],
): { offsets: number[]; actualMs: number[]; totalMs: number; totalBytes: number } {
  const frames: Frame[] = []
  let cursor = id3v2Length(buf)
  while (cursor < buf.length) {
    const frame = parseFrameHeader(buf, cursor)
    if (!frame) break
    frames.push(frame)
    cursor = frame.end
  }
  if (frames.length === 0) throw new Error('no MP3 frames found in encoded clip')

  const totalMs = frames.reduce((sum, f) => sum + f.durationMs, 0)
  const totalBytes = frames[frames.length - 1]!.end
  const target = ladderMs[ladderMs.length - 1]!
  if (totalMs + 1 < target) {
    throw new Error(`clip is ${totalMs.toFixed(0)}ms but the ladder needs ${target}ms`)
  }

  const offsets: number[] = []
  const actualMs: number[] = []
  let stage = 0
  let elapsed = 0
  for (const frame of frames) {
    elapsed += frame.durationMs
    while (stage < ladderMs.length && elapsed >= ladderMs[stage]!) {
      offsets.push(frame.end)
      actualMs.push(elapsed)
      stage++
    }
    if (stage === ladderMs.length) break
  }
  if (offsets.length !== ladderMs.length) {
    throw new Error(`resolved ${offsets.length}/${ladderMs.length} ladder stages`)
  }
  return { offsets, actualMs, totalMs, totalBytes }
}

// ---------------------------------------------------------------------------
// Audio processing (mirrors scripts/ingest.ts)
// ---------------------------------------------------------------------------

const LoudnessStatsSchema = z.object({
  input_i: z.string(),
  input_tp: z.string(),
  input_lra: z.string(),
  input_thresh: z.string(),
  target_offset: z.string(),
})
type LoudnessStats = z.infer<typeof LoudnessStatsSchema>

export async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ])
  const seconds = parseFloat(stdout.trim())
  if (!isFinite(seconds)) throw new Error(`ffprobe gave no duration for ${file}`)
  return Math.round(seconds * 1000)
}

async function measureLoudness(
  file: string,
  startMs: number,
  durationMs: number,
): Promise<LoudnessStats | null> {
  const filter = `loudnorm=I=${LOUDNORM.I}:TP=${LOUDNORM.TP}:LRA=${LOUDNORM.LRA}:print_format=json`
  const { stderr } = await run(
    'ffmpeg',
    [
      '-hide_banner', '-nostdin',
      '-i', file,
      '-ss', (startMs / 1000).toFixed(3),
      '-t', (durationMs / 1000).toFixed(3),
      '-af', filter,
      '-f', 'null', '-',
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  )
  const match = stderr.match(/\{[\s\S]*?\}/)
  if (!match) return null
  const parsed = LoudnessStatsSchema.safeParse(JSON.parse(match[0]))
  return parsed.success ? parsed.data : null
}

async function encodeClip(
  source: string,
  destination: string,
  startMs: number,
  durationMs: number,
  stats: LoudnessStats | null,
): Promise<void> {
  const loudnorm = stats
    ? `loudnorm=I=${LOUDNORM.I}:TP=${LOUDNORM.TP}:LRA=${LOUDNORM.LRA}` +
      `:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}` +
      `:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}` +
      `:offset=${stats.target_offset}:linear=true:print_format=none`
    : `loudnorm=I=${LOUDNORM.I}:TP=${LOUDNORM.TP}:LRA=${LOUDNORM.LRA}:print_format=none`
  const filters = `${loudnorm},afade=t=in:st=0:d=${FADE_IN_SECONDS}`
  await run(
    'ffmpeg',
    [
      '-hide_banner', '-nostdin', '-y',
      '-i', source,
      '-ss', (startMs / 1000).toFixed(3),
      '-t', (durationMs / 1000).toFixed(3),
      '-af', filters,
      '-ac', String(CHANNELS),
      '-ar', String(SAMPLE_RATE),
      '-c:a', 'libmp3lame',
      '-b:a', `${BITRATE_KBPS}k`,
      '-write_xing', '0',
      '-id3v2_version', '0',
      '-map_metadata', '-1',
      '-vn',
      destination,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  )
}

export type ProcessedClip = {
  clip: Buffer
  checksum: string
  storageKey: string
  stageByteOffsets: number[]
  actualMs: number[]
  durationMs: number
  playableMs: number
  masterMs: number
}

export async function processAudioFile(
  masterPath: string,
  hookStartMs: number,
  ladder: number[],
  workDir: string,
): Promise<ProcessedClip> {
  const playableWindowMs = ladder[ladder.length - 1]!
  const masterMs = await probeDurationMs(masterPath)
  const available = masterMs - hookStartMs

  if (available < playableWindowMs) {
    throw new Error(
      `hookStartMs ${hookStartMs} leaves only ${available}ms of ${masterMs}ms — ` +
        `the ladder needs ${playableWindowMs}ms`,
    )
  }

  const windowMs = Math.min(CLIP_WINDOW_MS, available)
  const stats = await measureLoudness(masterPath, hookStartMs, windowMs)
  const outPath = join(workDir, 'clip.mp3')
  await encodeClip(masterPath, outPath, hookStartMs, windowMs, stats)

  const encoded = await readFile(outPath)
  const { offsets, actualMs, totalMs, totalBytes } = computeLadderOffsets(encoded, ladder)
  const clip = encoded.subarray(0, totalBytes)
  const checksum = createHash('sha256').update(clip).digest('hex')

  return {
    clip,
    checksum,
    storageKey: `songless/clips/${checksum}.mp3`,
    stageByteOffsets: offsets,
    actualMs,
    durationMs: Math.round(totalMs),
    playableMs: Math.round(actualMs[actualMs.length - 1]!),
    masterMs,
  }
}

// ---------------------------------------------------------------------------
// Artwork encoding
// ---------------------------------------------------------------------------

export type ProcessedArtwork = {
  data: Buffer
  checksum: string
  storageKey: string
}

export async function encodeArtworkFromBuffer(source: Buffer): Promise<ProcessedArtwork> {
  const data = await sharp(source, { failOn: 'error' })
    .resize(600, 600, { fit: 'cover', position: 'centre', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 80, effort: 5 })
    .toBuffer()

  const checksum = createHash('sha256').update(data).digest('hex')
  return {
    data,
    checksum,
    storageKey: `songless/artwork/${checksum}.${ARTWORK_EXTENSION}`,
  }
}

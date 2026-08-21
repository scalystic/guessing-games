// MP3 frame walker — turns a reveal ladder in ms into exact byte offsets.
//
// This exists because PuzzleAsset.stageByteOffsets cannot be computed with
// arithmetic. A CBR 128kbps/44.1kHz frame is floor(144 * 128000 / 44100) = 417.96
// bytes, so the encoder alternates 417- and 418-byte frames using the padding
// bit. Multiplying ms by a bitrate lands mid-frame, and a mid-frame cut is an
// audible glitch (or an undecodable tail). So we read the real frame headers.
//
// Only Layer III is supported, which is all the ingest pipeline produces. The
// parser reads each frame's own header rather than assuming the first one
// applies, so it stays correct if the encode ever switches to VBR.

/// Bitrate tables are indexed by the 4-bit header field. Index 0 is "free" and
/// 15 is "bad"; both are treated as unparseable.
const BITRATES_KBPS_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
]
const BITRATES_KBPS_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
]

const SAMPLE_RATES: Record<MpegVersion, readonly number[]> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
}

/// Samples emitted per frame. MPEG-2 and 2.5 halve the granule count, which
/// halves both the frame duration and the frame size coefficient.
const SAMPLES_PER_FRAME: Record<MpegVersion, number> = { 1: 1152, 2: 576, 2.5: 576 }
const SIZE_COEFFICIENT: Record<MpegVersion, number> = { 1: 144, 2: 72, 2.5: 72 }

type MpegVersion = 1 | 2 | 2.5

export type Mp3Frame = {
  /// Byte offset of this frame's first header byte.
  offset: number
  /// Byte offset one past this frame's last byte — i.e. the next frame's offset.
  end: number
  durationMs: number
}

/// ID3v2 tags sit before the first frame and carry a syncsafe length. The ingest
/// encode suppresses them (-id3v2_version 0), but a hand-supplied file may not,
/// and a stray tag would shift every offset.
function id3v2Length(buf: Buffer): number {
  if (buf.length < 10) return 0
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0 // "ID3"
  // Syncsafe: 7 bits per byte, high bit always clear.
  const size =
    (buf[6]! << 21) | (buf[7]! << 14) | (buf[8]! << 7) | buf[9]!
  const footer = (buf[5]! & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

function parseFrameHeader(buf: Buffer, at: number): Mp3Frame | null {
  if (at + 4 > buf.length) return null

  const b0 = buf[at]!
  const b1 = buf[at + 1]!
  const b2 = buf[at + 2]!

  // 11-bit sync word.
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null

  const versionBits = (b1 >> 3) & 0b11
  const version: MpegVersion | null =
    versionBits === 0b11 ? 1 : versionBits === 0b10 ? 2 : versionBits === 0b00 ? 2.5 : null
  if (version === null) return null // 0b01 is reserved

  // Layer bits 0b01 == Layer III. Anything else we don't produce and won't guess at.
  if (((b1 >> 1) & 0b11) !== 0b01) return null

  const bitrateIndex = (b2 >> 4) & 0b1111
  const table = version === 1 ? BITRATES_KBPS_V1_L3 : BITRATES_KBPS_V2_L3
  const bitrateKbps = table[bitrateIndex]!
  if (bitrateKbps === 0) return null // free-format or invalid

  const sampleRateIndex = (b2 >> 2) & 0b11
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex]
  if (sampleRate === undefined) return null // 0b11 is reserved

  const padding = (b2 >> 1) & 0b1

  const length =
    Math.floor((SIZE_COEFFICIENT[version] * bitrateKbps * 1000) / sampleRate) + padding
  if (length < 4 || at + length > buf.length) return null

  return {
    offset: at,
    end: at + length,
    durationMs: (SAMPLES_PER_FRAME[version] / sampleRate) * 1000,
  }
}

/// Walk every frame in the file. Throws if the stream doesn't start with a valid
/// frame, because a resync heuristic would silently produce wrong offsets — and
/// wrong offsets mean players hear the wrong amount of audio.
export function scanFrames(buf: Buffer): Mp3Frame[] {
  let cursor = id3v2Length(buf)

  const first = parseFrameHeader(buf, cursor)
  if (!first) {
    throw new Error(
      `no MP3 frame at byte ${cursor} — not a bare MP3, or not Layer III`,
    )
  }

  const frames: Mp3Frame[] = []
  while (cursor < buf.length) {
    const frame = parseFrameHeader(buf, cursor)
    if (!frame) break // trailing tag (ID3v1/APE) or truncation; stop cleanly
    frames.push(frame)
    cursor = frame.end
  }

  return frames
}

export type LadderOffsets = {
  /// Exclusive end byte per ladder stage. Feed straight into
  /// PuzzleAsset.stageByteOffsets.
  offsets: number[]
  /// What each stage will ACTUALLY play, after rounding up to a frame boundary.
  /// Always >= the requested ms, never less — a stage must not underdeliver.
  actualMs: number[]
  totalMs: number
}

/// Map each cumulative ladder value to the end of the first frame that reaches
/// it. Rounds UP: stage 1 asking for 200ms at 26.12ms/frame gets 8 frames
/// (209ms), never 7 (183ms).
export function computeLadderOffsets(buf: Buffer, ladderMs: number[]): LadderOffsets {
  if (ladderMs.length === 0) throw new Error('ladder is empty')
  for (let i = 1; i < ladderMs.length; i++) {
    if (ladderMs[i]! <= ladderMs[i - 1]!) {
      throw new Error(`ladder must be strictly increasing (stage ${i + 1} <= ${i})`)
    }
  }

  const frames = scanFrames(buf)
  if (frames.length === 0) throw new Error('no frames found')

  const totalMs = frames.reduce((sum, f) => sum + f.durationMs, 0)
  const target = ladderMs[ladderMs.length - 1]!
  if (totalMs + 1 < target) {
    throw new Error(
      `clip is ${totalMs.toFixed(0)}ms but the ladder needs ${target}ms — re-cut it longer`,
    )
  }

  const offsets: number[] = []
  const actualMs: number[] = []

  let stage = 0
  let elapsed = 0
  for (const frame of frames) {
    elapsed += frame.durationMs
    // A single frame can satisfy more than one stage if the ladder is dense.
    while (stage < ladderMs.length && elapsed >= ladderMs[stage]!) {
      offsets.push(frame.end)
      actualMs.push(elapsed)
      stage++
    }
    if (stage === ladderMs.length) break
  }

  // Unreachable given the totalMs guard above, but an under-length offsets array
  // would be a silent corruption rather than a crash, so assert it.
  if (offsets.length !== ladderMs.length) {
    throw new Error(`resolved ${offsets.length}/${ladderMs.length} stages`)
  }

  // Offsets stop at the last frame the ladder actually reaches, which is usually
  // SHORT of buf.length: encoders flush a final partial frame past the requested
  // duration. The caller is expected to trim the buffer to offsets[last] so no
  // stored byte is unreachable and byteSize == the final offset. Deliberately not
  // clamped to buf.length here — that would bake the extra frame into stage 6.
  return { offsets, actualMs, totalMs }
}

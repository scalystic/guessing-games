import 'server-only'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { isStorageConfigured, objectSize, putObject, readObjectStream } from '@/lib/storage'

/**
 * Decoded source audio for the admin hook editor.
 *
 * WHY THIS EXISTS AT ALL, given every round already streams from YouTube.
 *
 * The hook editor's whole job is to place a single millisecond value —
 * Song.hookStartMs — and stage 1 of a round is 400ms long. Getting that value
 * wrong by 300ms is the difference between the first thing a player hears being
 * the vocal and it being the tail of a cymbal. The YouTube IFrame API cannot
 * support that: `seekTo()` lands within roughly 50-250ms of where you asked
 * (it resolves to a container fragment boundary, not a sample),
 * `getCurrentTime()` is quantised to about a frame, and there is no route to the
 * samples at all — a cross-origin iframe hands out no audio data, so a waveform
 * is impossible. An editor built on it would print milliseconds it cannot hit.
 *
 * So the admin path decodes the track itself: yt-dlp fetches the audio stream,
 * ffmpeg normalises it to one channel of lossless FLAC, and the browser loads
 * the whole thing into an AudioBuffer.
 *
 * This is ADMIN-ONLY and does not change what players hear. Players still stream
 * from YouTube; this only produces a more accurate number for them to stream
 * from.
 *
 * ===========================================================================
 * WHERE THE WORK HAPPENS — three moving parts, and why
 * ===========================================================================
 *
 * Extraction needs yt-dlp and ffmpeg on PATH plus a writable filesystem, none of
 * which a Vercel serverless function has. That single constraint shapes
 * everything below.
 *
 *   1. R2 IS THE CACHE, not the local disk.
 *
 *      An extracted FLAC is keyed by video id alone (`admin-audio/<id>.flac`) —
 *      the bytes depend only on the YouTube video, never on hookStartMs or on
 *      which puzzle points at it. Putting that in the object store the app
 *      already has, rather than on whichever box happened to extract it, is what
 *      lets the other two parts work at all. Vercel can serve a song it could
 *      never have extracted.
 *
 *      A local disk cache is still used underneath when R2 isn't configured, so
 *      a checkout with no storage credentials still works.
 *
 *   2. EXTRACTION RUNS WHEREVER THE TOOLCHAIN IS.
 *
 *      Set AUDIO_SERVICE_URL and extraction is delegated to the Render backend
 *      (guessing-games-backend), which has ffmpeg preinstalled and yt-dlp
 *      installed at build. Leave it unset — the local-dev case — and it runs
 *      here, in this process.
 *
 *      Both paths write to the same R2 cache, and that is deliberate rather than
 *      incidental: a song reviewed from a laptop is uploaded once and then
 *      served in production without Render ever touching it. Which matters more
 *      than it sounds, because of part 3.
 *
 *   3. IT IS ALWAYS A JOB, NEVER A BLOCKING REQUEST.
 *
 *      A cold extraction is a download plus a transcode — tens of seconds, up to
 *      a couple of minutes on a slow CDN pull. That does not fit inside a
 *      serverless request on any plan worth relying on. So the route exposes
 *      start / poll / fetch, and both providers implement the same three verbs.
 *      The local provider gets the same treatment as the remote one even though
 *      it could block, because one protocol beats two.
 *
 * ===========================================================================
 * THE THING MOST LIKELY TO BITE — YouTube and datacenter IPs
 * ===========================================================================
 *
 * YouTube challenges datacenter address ranges far more aggressively than
 * residential ones ("Sign in to confirm you're not a bot"), and Render is a
 * datacenter. Extraction from there may work, may work intermittently, or may be
 * refused outright depending on what YouTube is doing that week. Three things
 * hedge against it, in descending order of how much they help:
 *
 *   • The R2 cache above. Review a song from your laptop and production never
 *     asks YouTube for it. This is the real mitigation; the other two are
 *     patches.
 *   • YTDLP_COOKIES — a Netscape-format cookie jar from a signed-in (throwaway)
 *     YouTube account, which is what YouTube's challenge is actually asking for.
 *   • YTDLP_PLAYER_CLIENTS — forcing the android/ios players, which sometimes
 *     sidesteps the check entirely.
 *
 * None of them is a guarantee, and the failure is reported as a named 502 rather
 * than being retried into the ground.
 *
 * ===========================================================================
 * Format: mono FLAC at 32kHz, 16-bit
 * ===========================================================================
 *
 * Lossless, because a lossy codec answers "where does the audio start?" with its
 * own encoder delay folded in. MP3 prepends ~576 samples of decoder priming;
 * whether that gets trimmed depends on the LAME/Xing header surviving and on the
 * browser honouring it, which is exactly the kind of few-millisecond ambiguity
 * this editor exists to remove. FLAC has no priming to argue about.
 *
 * Mono, because the editor draws and analyses one channel and a hook onset is
 * not a stereo phenomenon.
 *
 * 32kHz rather than the source rate, because 32kHz already puts one sample at
 * 0.031ms — thirty times finer than the millisecond the UI exposes — while
 * keeping ~16kHz of bandwidth, so the track still sounds like the track.
 *
 * 16-bit EXPLICITLY, because ffmpeg does not default to it here: yt-dlp yields
 * Opus or AAC, both of which decode to float, and the flac encoder then picks
 * 24-bit to avoid discarding precision it assumes you want. On a real track that
 * was 39MB where s16 is 22MB, for eight bits of dynamic range that cannot affect
 * where an onset is.
 *
 * KEEP THIS IN SYNC with guessing-games-backend/src/audio/extract.ts, which
 * carries the same constants for the same reasons. The two repos deploy
 * independently and share no package (that repo's README explains the
 * convention); a drift in sample rate or bit depth would mean the same video
 * cached under the same key with different bytes depending on who extracted it.
 */

// ---------------------------------------------------------------------------
// Shared shape
// ---------------------------------------------------------------------------

export type SourceAudioStatus =
  /// Cached and servable right now.
  | { state: 'ready'; byteSize: number }
  /// Someone is extracting it. Poll again.
  | { state: 'extracting' }
  /// Not cached and nothing is working on it.
  | { state: 'absent' }
  | { state: 'error'; kind: SourceAudioErrorKind; message: string }

/// 'toolchain' means this deployment cannot extract at all — a missing binary,
/// no audio service configured. Retrying changes nothing, and the route answers
/// 503. 'extraction' means the attempt failed for this video, which retrying or
/// supplying cookies sometimes fixes; the route answers 502.
export type SourceAudioErrorKind = 'toolchain' | 'extraction'

export const SOURCE_AUDIO_MIME = 'audio/flac'

/// Refuse absurd inputs before they reach a subprocess argv, an object key or a
/// filesystem path. A YouTube id is 11 characters of [A-Za-z0-9_-].
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function isVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value)
}

const SAMPLE_RATE = 32_000
const CHANNELS = 1
const SAMPLE_FORMAT = 's16'
/// libFLAC's default and the knee of the curve — level 8 buys a few percent for
/// several times the CPU, on a file that exists only to be listened to once.
const FLAC_COMPRESSION = 5

/// Ceiling on one extraction. Past this it has failed in a way a longer wait
/// will not fix.
const EXTRACT_TIMEOUT_MS = 240_000

/// Object key. Flat and derived purely from the video id — see the cache note in
/// the header comment.
export function sourceAudioKey(videoId: string): string {
  return `admin-audio/${videoId}.flac`
}

/// Derived from the id and the encode settings rather than the bytes, so it
/// survives a re-extraction producing a byte-different but equivalent file, and
/// so changing SAMPLE_RATE/CHANNELS/SAMPLE_FORMAT invalidates every browser's
/// copy instead of leaving admins looking at a stale waveform.
export function sourceAudioEtag(videoId: string): string {
  const hash = createHash('sha1')
    .update(`${videoId}:${SAMPLE_RATE}:${CHANNELS}:${SAMPLE_FORMAT}:flac`)
    .digest('hex')
    .slice(0, 16)
  return `"${hash}"`
}

export class SourceAudioError extends Error {
  constructor(
    message: string,
    readonly kind: SourceAudioErrorKind,
  ) {
    super(message)
    this.name = 'SourceAudioError'
  }
}

// ---------------------------------------------------------------------------
// Local disk cache — the fallback when R2 isn't configured
// ---------------------------------------------------------------------------

/// Repo-local rather than os.tmpdir() so it is visible, greppable and trivially
/// clearable, and so a distro mounting /tmp as a small tmpfs can't fill during a
/// review session. Gitignored; deleting it is always safe.
const CACHE_DIR = join(process.cwd(), '.cache', 'admin-audio')

function localPath(videoId: string): string {
  return join(CACHE_DIR, `${videoId}.flac`)
}

async function localSize(videoId: string): Promise<number | null> {
  try {
    const info = await stat(localPath(videoId))
    // A zero-byte file is the fingerprint of an extraction killed after the
    // rename (or a disk that filled). Treat it as absent so the next request
    // retries rather than serving an undecodable empty response.
    return info.isFile() && info.size > 0 ? info.size : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Cache reads — R2 first, local disk second
// ---------------------------------------------------------------------------

/// Size of the cached object, or null if it isn't cached anywhere.
export async function cachedSize(videoId: string): Promise<number | null> {
  if (isStorageConfigured()) {
    const remote = await objectSize(sourceAudioKey(videoId)).catch(() => null)
    if (remote !== null && remote > 0) return remote
  }
  return localSize(videoId)
}

/// Open the cached audio for streaming back to the browser, or null on a miss.
///
/// Streamed rather than buffered: this is a lossless decode of a whole track
/// (10-40MB), and holding one in a serverless function's memory purely to hand
/// it straight out is waste with a failure mode attached.
export async function openCachedAudio(
  videoId: string,
): Promise<{ body: ReadableStream<Uint8Array>; byteSize: number | null } | null> {
  if (isStorageConfigured()) {
    const remote = await readObjectStream(sourceAudioKey(videoId)).catch(() => null)
    if (remote) return { body: remote.body, byteSize: remote.byteSize }
  }

  const size = await localSize(videoId)
  if (size === null) return null

  return {
    body: Readable.toWeb(createReadStream(localPath(videoId))) as ReadableStream<Uint8Array>,
    byteSize: size,
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

function remoteServiceUrl(): string | null {
  const url = process.env.AUDIO_SERVICE_URL?.trim()
  return url ? url.replace(/\/+$/, '') : null
}

/**
 * Status of the cache plus whatever is currently working on it.
 *
 * Checks the cache FIRST, in both providers. An extraction that finished after
 * the last poll is indistinguishable from one that was never needed, and both
 * mean the same thing to the caller.
 */
export async function sourceAudioStatus(videoId: string): Promise<SourceAudioStatus> {
  if (!isVideoId(videoId)) {
    return { state: 'error', kind: 'extraction', message: `"${videoId}" is not a YouTube video id.` }
  }

  const size = await cachedSize(videoId)
  if (size !== null) return { state: 'ready', byteSize: size }

  const service = remoteServiceUrl()
  if (service) return remoteStatus(service, videoId)

  return localStatus(videoId)
}

/**
 * Begin extraction if it isn't cached and isn't already running. Returns
 * immediately with the resulting status — never waits for the work.
 */
export async function startSourceAudio(
  videoId: string,
  opts: { force?: boolean } = {},
): Promise<SourceAudioStatus> {
  if (!isVideoId(videoId)) {
    return { state: 'error', kind: 'extraction', message: `"${videoId}" is not a YouTube video id.` }
  }

  if (!opts.force) {
    const size = await cachedSize(videoId)
    if (size !== null) return { state: 'ready', byteSize: size }
  }

  const service = remoteServiceUrl()
  if (service) return remoteStart(service, videoId, opts.force === true)

  return localStart(videoId, opts.force === true)
}

// ---------------------------------------------------------------------------
// Remote provider — the Render backend
// ---------------------------------------------------------------------------

/**
 * Server-to-server only, authenticated with a bearer secret.
 *
 * Note what is NOT here: any path from the browser to the audio service. The
 * browser talks to this app, which streams bytes out of R2; the service's only
 * job is to put them there. That keeps the admin session as the single gate on
 * the audio (no second auth scheme, no signed URLs to expire) and means the
 * service needs no CORS configuration at all.
 */
function remoteHeaders(): HeadersInit {
  const secret = process.env.AUDIO_SERVICE_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : {}
}

/// Short. These calls only ever read or set job state — the extraction itself is
/// asynchronous on the far side — so a slow answer means the service is down or
/// cold-starting, not that it is working hard.
const REMOTE_TIMEOUT_MS = 15_000

async function remoteCall(
  service: string,
  path: string,
  init: RequestInit = {},
): Promise<SourceAudioStatus> {
  try {
    const response = await fetch(`${service}${path}`, {
      ...init,
      headers: { ...remoteHeaders(), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      cache: 'no-store',
    })

    const json = (await response.json().catch(() => null)) as
      | { state?: string; message?: string; kind?: string; byteSize?: number }
      | null

    if (!response.ok) {
      return {
        state: 'error',
        kind: response.status === 503 ? 'toolchain' : 'extraction',
        message: json?.message ?? `Audio service returned ${response.status}.`,
      }
    }

    switch (json?.state) {
      case 'ready':
        return { state: 'ready', byteSize: json.byteSize ?? 0 }
      case 'extracting':
        return { state: 'extracting' }
      case 'error':
        return {
          state: 'error',
          kind: json.kind === 'toolchain' ? 'toolchain' : 'extraction',
          message: json.message ?? 'Extraction failed.',
        }
      default:
        return { state: 'absent' }
    }
  } catch (error) {
    // A cold Render free instance takes ~50s to wake, which lands here as a
    // timeout. Saying so beats a bare "fetch failed" — the fix is to retry, and
    // the admin has no other way to know that.
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'the audio service did not respond in time (a free Render instance can take ~50s to wake — try again)'
        : error instanceof Error
          ? error.message
          : 'unknown error'
    return { state: 'error', kind: 'extraction', message: `Couldn't reach the audio service: ${reason}.` }
  }
}

function remoteStatus(service: string, videoId: string): Promise<SourceAudioStatus> {
  return remoteCall(service, `/audio/status/${videoId}`)
}

function remoteStart(service: string, videoId: string, force: boolean): Promise<SourceAudioStatus> {
  return remoteCall(service, `/audio/extract/${videoId}${force ? '?force=1' : ''}`, { method: 'POST' })
}

/// Ask the service for the first-audible offset. Used by the detect-hook route
/// when extraction is delegated — see that route for why it is a separate call
/// rather than something the editor derives client-side.
export async function remoteDetectHook(videoId: string): Promise<number> {
  const service = remoteServiceUrl()
  if (!service) throw new SourceAudioError('No audio service configured.', 'toolchain')

  const response = await fetch(`${service}/audio/detect-hook/${videoId}`, {
    method: 'POST',
    headers: remoteHeaders(),
    // Generous: unlike the status calls this one does block on real work, and on
    // a cold song that means a download plus two ffmpeg passes.
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    cache: 'no-store',
  })

  const json = (await response.json().catch(() => null)) as
    | { hookStartMs?: number; message?: string; kind?: string }
    | null

  if (!response.ok || typeof json?.hookStartMs !== 'number') {
    throw new SourceAudioError(
      json?.message ?? `Audio service returned ${response.status}.`,
      json?.kind === 'toolchain' || response.status === 503 ? 'toolchain' : 'extraction',
    )
  }

  return json.hookStartMs
}

export function hasRemoteAudioService(): boolean {
  return remoteServiceUrl() !== null
}

// ---------------------------------------------------------------------------
// Local provider — extraction in this process
// ---------------------------------------------------------------------------

type LocalJob = { state: 'extracting' } | { state: 'error'; kind: SourceAudioErrorKind; message: string }

/// Per-process job state. Also the concurrency guard: React StrictMode's
/// double-effect in dev, never mind two admins on one song, would otherwise
/// start two yt-dlp downloads racing on the same temp path.
const localJobs = new Map<string, LocalJob>()

function localStatus(videoId: string): SourceAudioStatus {
  return localJobs.get(videoId) ?? { state: 'absent' }
}

function localStart(videoId: string, force: boolean): SourceAudioStatus {
  const existing = localJobs.get(videoId)
  if (existing?.state === 'extracting') return existing
  if (existing?.state === 'error' && !force) return existing

  localJobs.set(videoId, { state: 'extracting' })

  // Deliberately not awaited. The caller is a route that must answer now; the
  // browser polls sourceAudioStatus() for the outcome.
  void extractLocally(videoId)
    .then(async (bytes) => {
      localJobs.delete(videoId)
      if (!isStorageConfigured()) return
      // Upload so every other environment gets it for free — the point of
      // keying the cache on the video id. A failure here is not fatal: the file
      // is on local disk and this box can still serve it.
      await putObject(sourceAudioKey(videoId), bytes, { contentType: SOURCE_AUDIO_MIME }).catch(
        (error: unknown) => {
          console.warn(`[source-audio] cached ${videoId} locally but could not upload to R2:`, error)
        },
      )
    })
    .catch((error: unknown) => {
      const failure =
        error instanceof SourceAudioError
          ? { state: 'error' as const, kind: error.kind, message: error.message }
          : {
              state: 'error' as const,
              kind: 'extraction' as const,
              message: error instanceof Error ? error.message : 'Extraction failed.',
            }
      localJobs.set(videoId, failure)
    })

  return { state: 'extracting' }
}

/**
 * yt-dlp | ffmpeg, straight through, resolving to the encoded bytes.
 *
 * Piped rather than run in two steps for the same reason lib/catalog/detect-hook
 * pipes: ffmpeg opening its own HTTP connection to the CDN produced a consistent
 * ~5s of phantom leading silence — which, on a tool whose entire output is
 * "where does the audio start", would be catastrophic rather than merely wrong.
 *
 * ffmpeg writes to a temp FILE rather than stdout because a FLAC STREAMINFO
 * block carries the total sample count and an MD5 of the audio, and both are
 * only known once the last sample is written. Over a pipe ffmpeg cannot seek
 * back to fill them in and leaves them zeroed; browsers cope, but a real
 * STREAMINFO gives decodeAudioData an exact length instead of one inferred from
 * frames. The rename into place afterwards is what stops a failed run from
 * leaving a half-written file that looks like a cache hit.
 */
async function extractLocally(videoId: string): Promise<Uint8Array> {
  await mkdir(CACHE_DIR, { recursive: true })

  const destination = localPath(videoId)
  // process.pid keeps two server processes pointed at the same checkout from
  // colliding here — the job map is per-process and cannot see across them.
  const tempPath = `${destination}.${process.pid}.partial`

  const ytdlp = spawn(process.env.YTDLP_PATH ?? 'yt-dlp', ytdlpArgs(videoId), {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const ffmpeg = spawn('ffmpeg', ffmpegArgs(tempPath), { stdio: ['pipe', 'ignore', 'pipe'] })

  ytdlp.stdout.pipe(ffmpeg.stdin)

  // Both sides of the pipe can legitimately break: if ffmpeg exits first (bad
  // input, killed by the timeout) yt-dlp's next write gets EPIPE, which Node
  // turns into an unhandled 'error' event and a process crash unless caught.
  ytdlp.stdout.on('error', () => {})
  ffmpeg.stdin.on('error', () => {})

  let ytdlpErr = ''
  let ffmpegErr = ''
  ytdlp.stderr.on('data', (chunk: Buffer) => {
    ytdlpErr += chunk.toString()
  })
  ffmpeg.stderr.on('data', (chunk: Buffer) => {
    ffmpegErr += chunk.toString()
  })

  // A missing binary surfaces as a spawn 'error', not a non-zero exit, and is
  // worth reporting differently: "install yt-dlp" is a different problem from
  // "YouTube refused this video".
  const spawnFailures = new Map<string, NodeJS.ErrnoException>()
  ytdlp.on('error', (error: NodeJS.ErrnoException) => spawnFailures.set('yt-dlp', error))
  ffmpeg.on('error', (error: NodeJS.ErrnoException) => spawnFailures.set('ffmpeg', error))

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ytdlp.kill('SIGKILL')
    ffmpeg.kill('SIGKILL')
  }, EXTRACT_TIMEOUT_MS)

  const ffmpegExit = await new Promise<number | null>((resolve) => {
    ffmpeg.on('close', resolve)
  })
  clearTimeout(timer)
  try {
    ytdlp.kill('SIGKILL')
  } catch {
    /* already gone */
  }

  const cleanup = () => rm(tempPath, { force: true }).catch(() => {})

  for (const [name, error] of spawnFailures) {
    if (error.code === 'ENOENT') {
      await cleanup()
      throw new SourceAudioError(
        `${name} is not installed or not on PATH, and AUDIO_SERVICE_URL is not set. ` +
          `The hook editor needs either a local yt-dlp + ffmpeg or a configured audio service.`,
        'toolchain',
      )
    }
  }

  if (timedOut) {
    await cleanup()
    throw new SourceAudioError(
      `Extraction timed out after ${EXTRACT_TIMEOUT_MS / 1000}s.`,
      'extraction',
    )
  }

  if (ffmpegExit !== 0) {
    await cleanup()
    throw new SourceAudioError(describeFailure(videoId, ytdlpErr, ffmpegErr), 'extraction')
  }

  const info = await stat(tempPath).catch(() => null)
  if (!info || info.size === 0) {
    await cleanup()
    throw new SourceAudioError(`Extraction produced no audio for ${videoId}.`, 'extraction')
  }

  await rename(tempPath, destination)
  return readFile(destination)
}

// ---------------------------------------------------------------------------
// Subprocess arguments — shared shape with the backend, see the header note
// ---------------------------------------------------------------------------

export function ytdlpArgs(videoId: string): string[] {
  const args = [
    '--quiet',
    '--no-warnings',
    '--no-playlist',
    '-f',
    'bestaudio/best',
    '-o',
    '-',
  ]

  // A cookie jar exported from a signed-in account. The single most effective
  // answer to "Sign in to confirm you're not a bot", because it is literally
  // what the challenge is asking for.
  const cookieFile = process.env.YTDLP_COOKIES_FILE?.trim()
  if (cookieFile) args.unshift('--cookies', cookieFile)

  // Local-dev convenience: read cookies straight out of an installed browser.
  // Useless on a server, which has no browser profile — YTDLP_COOKIES_FILE is
  // the deployable form.
  const browser = process.env.YTDLP_BROWSER?.trim()
  if (browser && !cookieFile) args.unshift('--cookies-from-browser', browser)

  // Forcing the mobile players sometimes sidesteps the bot check entirely, and
  // costs nothing when it isn't needed. Left unset by default rather than
  // hardcoded: which clients work changes with what YouTube ships, so this is a
  // dial to turn when it breaks, not a fixed answer baked into a deploy.
  const clients = process.env.YTDLP_PLAYER_CLIENTS?.trim()
  if (clients) args.push('--extractor-args', `youtube:player_client=${clients}`)

  // `--` so an id starting with "-" is an argument rather than a flag. The
  // pattern check in isVideoId already forbids it; this makes that a second line
  // of defence rather than the only one.
  args.push('--', videoId)
  return args
}

export function ffmpegArgs(outputPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    // Drop the video stream. Music videos and static-art uploads both carry one,
    // and decoding it is pure waste for an audio-only editor.
    '-vn',
    '-ac',
    String(CHANNELS),
    '-ar',
    String(SAMPLE_RATE),
    '-sample_fmt',
    SAMPLE_FORMAT,
    '-c:a',
    'flac',
    '-compression_level',
    String(FLAC_COMPRESSION),
    // Container stated explicitly: ffmpeg normally infers it from the output
    // extension, and the temp file's is ".partial" — it fails with "Error
    // initializing the muxer ... Invalid argument" rather than guessing from the
    // codec.
    '-f',
    'flac',
    '-y',
    outputPath,
  ]
}

/// Turn subprocess stderr into something an admin can act on.
///
/// yt-dlp's stderr is the useful half almost every time (age gate, region block,
/// removed video, bot challenge); ffmpeg's is usually just "pipe:0: Invalid
/// data" downstream of it. The bot-challenge case gets named explicitly because
/// its raw text does not suggest the fix, and the fix is configuration rather
/// than a retry.
export function describeFailure(videoId: string, ytdlpErr: string, ffmpegErr: string): string {
  const combined = `${ytdlpErr}\n${ffmpegErr}`

  if (/confirm you'?re not a bot|Sign in to confirm/i.test(combined)) {
    return (
      `YouTube is challenging this request as a bot, which it does far more often to ` +
      `datacenter IPs than to home connections. Either review this song from a machine on a ` +
      `home connection (it uploads to shared storage, so production picks it up), or set ` +
      `YTDLP_COOKIES on the audio service.`
    )
  }

  const detail = (ytdlpErr || ffmpegErr).trim().split('\n').slice(-3).join(' ')
  return `Could not extract audio for ${videoId}.${detail ? ` ${detail}` : ''}`
}

import { spawn } from 'child_process'

/**
 * Detect the exact millisecond where a YouTube video's audio first becomes
 * audible — i.e. the end of any leading silence/digital-zero gap.
 *
 * Design choices:
 *  • yt-dlp is piped directly into ffmpeg so ffmpeg never opens its own HTTP
 *    connection to the CDN (which caused a consistent ~5 s false-silence
 *    reading in the two-step approach).
 *  • YTDLP_PATH env var lets you point at a newer yt-dlp binary without
 *    touching the system install (YouTube breaks old versions frequently).
 *  • YTDLP_BROWSER env var passes --cookies-from-browser so yt-dlp can
 *    bypass YouTube's bot-detection. Set to your browser name: firefox,
 *    chrome, chromium, edge, etc.
 *  • threshold -50 dB (not -35 dB): catches quiet intros — soft strings,
 *    tabla taps, whispered lyrics — that are louder than -35 dB and would
 *    otherwise make the detector think no silence exists.
 *  • minimum duration 0.02 s (20 ms): filters single-frame codec noise but
 *    still reports a silence that ends after just one audio frame.
 *  • No artificial floor on the detected value — the exact timestamp is used.
 *    Only falls back to 500 ms when detection fails entirely.
 */
export async function detectHookStart(videoId: string): Promise<number> {
  const ytdlpBin = process.env.YTDLP_PATH ?? 'yt-dlp'
  const browser = process.env.YTDLP_BROWSER

  const ytdlpArgs = [
    ...(browser ? ['--cookies-from-browser', browser] : []),
    '--quiet', '--no-warnings',
    
    '-f', 'bestaudio/best',
    '-o', '-',
    '--', videoId,
  ]

  return new Promise<number>((resolve) => {
    const ytdlp = spawn(ytdlpBin, ytdlpArgs, { stdio: ['ignore', 'pipe', 'ignore'] })

    const ffmpeg = spawn(
      'ffmpeg',
      ['-i', 'pipe:0', '-t', '30', '-af', 'silencedetect=n=-50dB:d=0.02', '-f', 'null', '-'],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    )

    ytdlp.stdout.pipe(ffmpeg.stdin)
    // When ffmpeg finishes reading 30 s and closes its stdin, yt-dlp gets an
    // EPIPE on its stdout. Without this handler Node would throw and crash.
    ytdlp.stdout.on('error', () => { /* expected broken-pipe once ffmpeg stops reading */ })
    ffmpeg.stdin.on('error', () => { /* same — suppress the write-side EPIPE */ })

    let stderr = ''
    ffmpeg.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    const timer = setTimeout(() => {
      ytdlp.kill('SIGKILL')
      ffmpeg.kill('SIGKILL')
      resolve(500)
    }, 90_000)

    const finish = () => {
      clearTimeout(timer)
      try { ytdlp.kill('SIGKILL') } catch { /* noop */ }

      const ends: number[] = []
      for (const match of stderr.matchAll(/silence_end:\s*([\d.]+)/g)) {
        ends.push(parseFloat(match[1]!))
      }

      // No leading silence found — song starts with audio immediately.
      if (ends.length === 0) { resolve(500); return }

      // Use the exact detected timestamp. A tiny floor of 50 ms absorbs any
      // single-sample codec pre-roll without masking real onset times.
      resolve(Math.max(Math.round(ends[0]! * 1000), 50))
    }

    ffmpeg.on('close', finish)
    ffmpeg.on('error', () => { clearTimeout(timer); resolve(500) })
    ytdlp.on('error', () => {
      clearTimeout(timer)
      try { ffmpeg.kill('SIGKILL') } catch { /* noop */ }
      resolve(500)
    })
  })
}

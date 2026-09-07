import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { prisma } from '@/lib/db'
import { detectHookStart } from '@/lib/catalog/detect-hook'
import { SourceAudioError, hasRemoteAudioService, remoteDetectHook } from '@/lib/admin/source-audio'

/**
 * POST /api/admin/songs/[puzzleId]/detect-hook
 *
 * Runs silence detection on the song's YouTube video and writes the result
 * back to Song.hookStartMs. Only works for songs with an externalId (YouTube).
 *
 * This is a FIRST DRAFT, not an answer — it finds where silence ends, which is
 * usually but not always where the hook is. That is the whole reason the review
 * workflow exists on top of it, and why it refuses a locked song for the same
 * reason PATCH does: a locked offset is one a human signed off on by ear, and a
 * detector must never overwrite it. Unlock first.
 *
 * Needs the same yt-dlp + ffmpeg toolchain as extraction, so it is delegated to
 * the audio service whenever one is configured. Unlike the source-audio route
 * this one BLOCKS on the work rather than polling, because the answer is a
 * single number rather than a file, and the caller is the list's "Detect" batch,
 * which already walks songs one at a time and tolerates individual failures.
 *
 * The blocking call is bounded by maxDuration below, and a cold song — one whose
 * audio the service has not extracted yet — can legitimately exceed it. That is
 * a per-song failure in a batch that continues, not a broken feature; the drawer
 * also carries a "First sound" button that answers the same question instantly
 * from audio the browser has already decoded.
 */

/// Delegated detection blocks on a download plus two ffmpeg passes. 300s is
/// Vercel's ceiling on Pro; Hobby caps at 60s regardless of what is written here,
/// which is the plan where the cold-song case will time out.
export const maxDuration = 300
export async function POST(
  _request: Request,
  ctx: RouteContext<'/api/admin/songs/[puzzleId]/detect-hook'>,
): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  const { puzzleId } = await ctx.params

  const song = await prisma.song.findUnique({
    where: { puzzleId },
    select: { externalId: true, isLocked: true },
  })

  if (!song) return jsonError(404, 'not_found', 'Song not found.')
  if (!song.externalId) {
    return jsonError(422, 'no_video', 'This song has no YouTube video ID — cannot detect hook.')
  }
  if (song.isLocked) {
    return jsonError(
      409,
      'song_locked',
      'This song is locked. Unlock it before re-detecting where its hook starts.',
    )
  }

  try {
    const hookStartMs = hasRemoteAudioService()
      ? await remoteDetectHook(song.externalId)
      : await detectHookStart(song.externalId)

    await prisma.song.update({
      where: { puzzleId },
      data: { hookStartMs, hookStartAutoDetected: true },
    })

    return jsonOk({ hookStartMs })
  } catch (error) {
    if (error instanceof SourceAudioError) {
      // Same split as the source-audio route: 503 for "this deployment cannot do
      // this", 502 for "the upstream video could not be fetched".
      return jsonError(
        error.kind === 'toolchain' ? 503 : 502,
        error.kind === 'toolchain' ? 'audio_toolchain_missing' : 'audio_extract_failed',
        error.message,
      )
    }
    return internalErrorJson('admin.songs.detect-hook', error)
  }
}

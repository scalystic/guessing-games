import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { prisma } from '@/lib/db'
import {
  SOURCE_AUDIO_MIME,
  openCachedAudio,
  sourceAudioEtag,
  sourceAudioStatus,
  startSourceAudio,
  type SourceAudioStatus,
} from '@/lib/admin/source-audio'

/**
 * The decoded audio behind the hook editor: one channel of lossless FLAC for the
 * song's YouTube video, which the browser loads whole into an AudioBuffer. See
 * lib/admin/source-audio.ts for why the editor decodes its own audio instead of
 * driving the YouTube iframe like players do, and for where extraction runs.
 *
 *   GET  ?probe=1   status only — { state, byteSize? }
 *   POST ?force=1   begin extraction; returns immediately with the new status
 *   GET             stream the cached FLAC, or 409 with the status if not ready
 *
 * THREE VERBS, NOT ONE BLOCKING REQUEST. A cold extraction is a download plus a
 * transcode — tens of seconds, sometimes minutes — which does not fit inside a
 * serverless request. The client starts the job and polls. That also gives the
 * editor something honest to display: "extracting" and "loading a cached copy"
 * look identical behind a single spinner, and one of them is fifty times longer.
 *
 * ADMIN ONLY, and the gate is doing real work rather than being ceremony: this
 * serves the complete track, where a player is metered to at most 15s. Rounds do
 * not and must not use it.
 *
 * No Range handling on the GET. `decodeAudioData` needs every byte before it can
 * decode anything, so a ranged fetch would only add round trips to reassemble
 * what the client always wants in full — the exact opposite of the retired
 * player-facing clip route, whose whole purpose was to serve a prefix.
 */

export const dynamic = 'force-dynamic'

/// Only ever spent streaming bytes out of storage or making a short status call
/// — the extraction it waits on happens elsewhere, asynchronously. This does not
/// need to cover a cold extract, and deliberately doesn't.
export const maxDuration = 60

async function videoIdFor(puzzleId: string): Promise<
  { ok: true; videoId: string } | { ok: false; response: Response }
> {
  const song = await prisma.song.findUnique({
    where: { puzzleId },
    select: { externalId: true },
  })

  if (!song) return { ok: false, response: jsonError(404, 'not_found', 'Song not found.') }
  if (!song.externalId) {
    return {
      ok: false,
      response: jsonError(
        422,
        'no_video',
        'This song has no YouTube video id, so there is no audio to decode.',
      ),
    }
  }
  return { ok: true, videoId: song.externalId }
}

/// One JSON shape for every status answer, so the client has a single branch.
function statusJson(status: SourceAudioStatus): Response {
  return jsonOk(
    status.state === 'ready'
      ? { state: 'ready' as const, byteSize: status.byteSize }
      : status.state === 'error'
        ? { state: 'error' as const, kind: status.kind, message: status.message }
        : { state: status.state },
  )
}

export async function GET(
  request: Request,
  ctx: RouteContext<'/api/admin/songs/[puzzleId]/source-audio'>,
): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  const { puzzleId } = await ctx.params
  const resolved = await videoIdFor(puzzleId)
  if (!resolved.ok) return resolved.response

  const url = new URL(request.url)

  try {
    if (url.searchParams.get('probe') === '1') {
      return statusJson(await sourceAudioStatus(resolved.videoId))
    }

    const etag = sourceAudioEtag(resolved.videoId)
    // Cheap 304s on the repeat opens a review session is made of.
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }

    const cached = await openCachedAudio(resolved.videoId)
    if (!cached) {
      // 409 rather than 404: the song exists and the audio is obtainable, it
      // just isn't here yet. The body carries the status so a client that raced
      // ahead of its own polling doesn't need a second request to find out why.
      const status = await sourceAudioStatus(resolved.videoId)
      return jsonError(
        409,
        'audio_not_ready',
        status.state === 'error' ? status.message : 'Audio has not been extracted yet.',
        undefined,
      )
    }

    return new Response(cached.body, {
      headers: {
        'Content-Type': SOURCE_AUDIO_MIME,
        ...(cached.byteSize ? { 'Content-Length': String(cached.byteSize) } : {}),
        ETag: etag,
        // private: full-length audio behind an admin session, which must not be
        // held by a shared cache anywhere on the way back.
        'Cache-Control': 'private, max-age=3600, must-revalidate',
      },
    })
  } catch (error) {
    return internalErrorJson('admin.songs.source-audio', error)
  }
}

/// Begin extraction. Idempotent — starting a job that is already running, or one
/// whose output is already cached, is a no-op that reports the current state.
export async function POST(
  request: Request,
  ctx: RouteContext<'/api/admin/songs/[puzzleId]/source-audio'>,
): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  const { puzzleId } = await ctx.params
  const resolved = await videoIdFor(puzzleId)
  if (!resolved.ok) return resolved.response

  const url = new URL(request.url)

  try {
    const status = await startSourceAudio(resolved.videoId, {
      force: url.searchParams.get('force') === '1',
    })
    return statusJson(status)
  } catch (error) {
    return internalErrorJson('admin.songs.source-audio.start', error)
  }
}

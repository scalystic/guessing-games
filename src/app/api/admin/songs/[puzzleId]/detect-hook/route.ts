import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { prisma } from '@/lib/db'
import { detectHookStart } from '@/lib/catalog/detect-hook'

/**
 * POST /api/admin/songs/[puzzleId]/detect-hook
 *
 * Runs silence detection on the song's YouTube video and writes the result
 * back to Song.hookStartMs. Only works for songs with an externalId (YouTube).
 */
export async function POST(
  _request: Request,
  ctx: RouteContext<'/api/admin/songs/[puzzleId]/detect-hook'>,
): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  const { puzzleId } = await ctx.params

  const song = await prisma.song.findUnique({
    where: { puzzleId },
    select: { externalId: true },
  })

  if (!song) return jsonError(404, 'not_found', 'Song not found.')
  if (!song.externalId) {
    return jsonError(422, 'no_video', 'This song has no YouTube video ID — cannot detect hook.')
  }

  try {
    const hookStartMs = await detectHookStart(song.externalId)

    await prisma.song.update({
      where: { puzzleId },
      data: { hookStartMs, hookStartAutoDetected: true },
    })

    return jsonOk({ hookStartMs })
  } catch (error) {
    return internalErrorJson('admin.songs.detect-hook', error)
  }
}

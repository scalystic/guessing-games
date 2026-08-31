import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { prisma } from '@/lib/db'

/**
 * PATCH /api/admin/songs/[puzzleId]
 *
 * Partially update a song. Currently supports: hookStartMs.
 */
export async function PATCH(
  request: Request,
  ctx: RouteContext<'/api/admin/songs/[puzzleId]'>,
): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  const { puzzleId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'bad_request', 'Invalid JSON body.')
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('hookStartMs' in body) ||
    typeof (body as Record<string, unknown>).hookStartMs !== 'number'
  ) {
    return jsonError(400, 'bad_request', 'hookStartMs (number) is required.')
  }

  const hookStartMs = Math.max(0, Math.round((body as { hookStartMs: number }).hookStartMs))

  try {
    const song = await prisma.song.update({
      where: { puzzleId },
      data: { hookStartMs },
      select: { puzzleId: true, hookStartMs: true },
    })
    return jsonOk(song)
  } catch (error) {
    return internalErrorJson('admin.songs.patch', error)
  }
}

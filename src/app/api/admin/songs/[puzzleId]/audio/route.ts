import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, internalErrorJson } from '@/lib/api/response'
import { readObject, isStorageConfigured } from '@/lib/storage'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/songs/[puzzleId]/audio
 *
 * Serves the full stored audio clip for a puzzle so admin can preview it.
 * The clip already starts at hookStartMs (cut there during ingest), so
 * playback from position 0 is the hook.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/admin/songs/[puzzleId]/audio'>,
): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  if (!isStorageConfigured()) {
    return jsonError(503, 'storage_not_configured', 'Object storage is not configured.')
  }

  const { puzzleId } = await ctx.params

  const asset = await prisma.puzzleAsset.findUnique({
    where: { puzzleId_kind: { puzzleId, kind: 'AUDIO_CLIP' } },
    select: { storageKey: true, mimeType: true, byteSize: true },
  })

  if (!asset) {
    return jsonError(404, 'no_audio', 'No audio clip found for this puzzle.')
  }

  try {
    const bytes = await readObject(asset.storageKey)
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': asset.mimeType ?? 'audio/mpeg',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=60',
        'Accept-Ranges': 'none',
      },
    })
  } catch (error) {
    return internalErrorJson('admin.songs.audio', error)
  }
}

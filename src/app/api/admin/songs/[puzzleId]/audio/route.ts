import { getAdminUser } from '@/lib/admin/auth'
import { jsonError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/songs/[puzzleId]/audio — RETIRED (YouTube-only).
 *
 * Served the full stored audio clip for a puzzle so an admin could preview it.
 * The clip already started at hookStartMs (cut there during ingest), so playback
 * from position 0 was the hook.
 *
 * Stored clips are retired: nothing writes a PuzzleAsset of kind AUDIO_CLIP any
 * more, so there is nothing left for this to read. To audition a song, open its
 * YouTube id (Song.externalId) at Song.hookStartMs — that is the audio players
 * actually hear now, so it is also the only preview worth trusting.
 *
 * Retained as a 410 rather than deleted because the admin songs list links here;
 * a 410 with a named code is a readable answer where a 404 would look like a
 * missing puzzle.
 *
 * The retired body read `PuzzleAsset.storageKey` for kind AUDIO_CLIP and streamed
 * it back via `readObject`, gated on `isStorageConfigured()`. See git history.
 */
export async function GET(): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  return jsonError(
    410,
    'stored_audio_retired',
    'Stored audio clips are retired. Preview the song on YouTube using its video id and hookStartMs.',
  )
}

import { z } from 'zod'
import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'

/**
 * PATCH /api/admin/songs/[puzzleId]
 *
 * The write side of the hook review workflow. A handful of fields, and the
 * interesting part is the rules connecting them.
 *
 *   { hookStartMs }              save a new hook offset (song must be unlocked)
 *   { isLocked: true }           lock the current offset in
 *   { hookStartMs, isLocked }    the normal path out of the editor: save and
 *                                lock in one write
 *   { isLocked: false }          unlock, so it can be edited again
 *   { popularity }               retune live popularity by hand
 *   { isDraft: true }            set the song aside — out of rotation, out of
 *                                the guess typeahead, off the review queue
 *   { isDraft: false }           recover a draft back into the review queue
 *
 * DRAFTING IS THE REVERSIBLE OPPOSITE OF DELETING. An admin who doesn't want a
 * song in the list drafts it; nothing about the row is destroyed, so the
 * decision can be walked back later. It writes Puzzle.isBlocked, which
 * lib/game/selection.ts and both /search routes already filter on, so a draft
 * stops being playable and stops being an accepted guess the moment it is set.
 *
 * Drafting also UNLOCKS. A lock means "players are being scored against this",
 * and a drafted song isn't — so carrying the lock through the draft would leave
 * a stale sign-off that silently returned the song straight to rotation on
 * recovery. Clearing it means recovery always lands in review, where a human
 * looks at it again before it plays. Consequently a draft cannot be locked in
 * the same write: that request contradicts itself and is refused.
 *
 * Popularity is Puzzle's, not Song's, and it is normally telemetry's to move
 * (seeded at ingest, then corrected from solve rates). The manual override
 * lives here rather than on PUT /api/song/[puzzleId] so there is still exactly
 * one door into it, next to the list column that displays it. It is NOT gated
 * on the lock: the lock protects hookStartMs — the cut players are scored
 * against — while popularity only steers which difficulty band a puzzle is
 * sampled into, and a locked song in the wrong band is precisely the one you
 * need to retune.
 *
 * THE LOCK IS A WRITE GATE, NOT A LABEL. A locked song is one players are being
 * scored against, and hookStartMs is the single number deciding what the first
 * 400ms of a round sounds like. So moving it on a locked song is refused with a
 * 409 rather than quietly allowed: the only route to a new offset is unlock ->
 * edit -> lock, which is a deliberate act with a visible intermediate state
 * (the song drops out of rotation while it is unlocked) instead of a nudge that
 * silently re-cuts a live track.
 *
 * The one exception is `{ hookStartMs, isLocked: true }` on a song that is
 * ALREADY locked being re-locked — but that is not an exception at all, because
 * a locked song's editor is read-only and never produces that request. The check
 * below keys off the CURRENT lock state and whether this request is unlocking,
 * so an edit arriving alongside `isLocked: false` is accepted (unlock and edit
 * together) and an edit arriving with the song still locked afterwards is not.
 */

const PatchSchema = z
  .object({
    /// Upper bound is 60 minutes. Not a real musical limit — just far enough out
    /// that a mis-typed value can't be stored as a plausible offset.
    hookStartMs: z.number().int().min(0).max(3_600_000).optional(),
    isLocked: z.boolean().optional(),
    /// Same 0-100 range Puzzle.popularity and seedPopularity are stored on.
    popularity: z.number().int().min(0).max(100).optional(),
    /// Persisted as Puzzle.isBlocked. Named for what it means to an admin: a
    /// draft is a song held back from the catalog, not a takedown.
    isDraft: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.hookStartMs !== undefined ||
      body.isLocked !== undefined ||
      body.popularity !== undefined ||
      body.isDraft !== undefined,
    { message: 'Provide hookStartMs, isLocked, popularity, or isDraft.' },
  )

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

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(
      422,
      'validation_error',
      parsed.error.issues[0]?.message ?? 'Invalid request body.',
      parsed.error.flatten().fieldErrors,
    )
  }
  const { hookStartMs, isLocked, popularity, isDraft } = parsed.data

  const current = await prisma.song.findUnique({
    where: { puzzleId },
    select: {
      isLocked: true,
      hookStartMs: true,
      externalId: true,
      puzzle: { select: { isBlocked: true } },
    },
  })
  if (!current) return jsonError(404, 'not_found', 'Song not found.')

  const draftAfter = isDraft ?? current.puzzle.isBlocked
  // Locked after this request settles: what isLocked says if it was sent, and
  // otherwise whatever it already was — except that crossing the draft line in
  // EITHER direction resets the lock. Drafting drops the sign-off because the
  // song is no longer being played; recovery refuses to restore one, so a song
  // coming back always stops in review. That second half matters for rows
  // drafted through the edit form before this rule existed, which can still be
  // sitting in the drafts with isLocked true — recovering one has to put it in
  // front of a human, not straight back into rotation.
  const lockedAfter =
    isDraft !== undefined ? (isLocked ?? false) : (isLocked ?? current.isLocked)

  if (isDraft === true && isLocked === true) {
    return jsonError(
      422,
      'draft_cannot_be_locked',
      "A draft is held out of rotation, so it can't be locked at the same time.",
    )
  }

  if (hookStartMs !== undefined && current.isLocked && lockedAfter) {
    return jsonError(
      409,
      'song_locked',
      'This song is locked. Unlock it before changing where its hook starts.',
    )
  }

  // Keyed off an explicit lock request, not off lockedAfter: one of those
  // legacy drafted-and-locked rows would otherwise fail a plain popularity
  // retune, which isn't an attempt to lock anything.
  if (isLocked === true && draftAfter) {
    return jsonError(
      409,
      'song_drafted',
      'This song is a draft. Recover it into review before locking it.',
    )
  }

  if (lockedAfter && !current.externalId) {
    return jsonError(
      422,
      'no_video',
      "This song has no YouTube video id, so there is nothing to play. It can't be locked.",
    )
  }

  const data: Prisma.SongUpdateInput = {}
  const puzzleData: Prisma.PuzzleUpdateWithoutSongInput = {}

  if (hookStartMs !== undefined) {
    data.hookStartMs = hookStartMs
    // hookStartAutoDetected means "a script guessed this", and it drives the
    // "Detect All" batch's skip list. A human having set the value by ear is
    // strictly better information, so it stops being a candidate for
    // re-detection — which would otherwise overwrite the correction.
    data.hookStartAutoDetected = false
  }

  if (lockedAfter !== current.isLocked) {
    data.isLocked = lockedAfter
    // Cleared on unlock rather than left behind, so these always describe the
    // lock in force instead of the last one ever taken.
    data.lockedAt = lockedAfter ? new Date() : null
    data.lockedById = lockedAfter ? admin.id : null
  }

  // seedPopularity is deliberately left alone: it is the original external
  // signal, kept so a retune stays auditable and reversible.
  if (popularity !== undefined) {
    puzzleData.popularity = popularity
  }

  if (isDraft !== undefined) {
    puzzleData.isBlocked = isDraft
  }

  if (Object.keys(puzzleData).length > 0) {
    data.puzzle = { update: puzzleData }
  }

  try {
    const song = await prisma.song.update({
      where: { puzzleId },
      data,
      select: {
        puzzleId: true,
        hookStartMs: true,
        hookStartAutoDetected: true,
        isLocked: true,
        lockedAt: true,
        puzzle: { select: { popularity: true, isBlocked: true } },
      },
    })
    const { puzzle, ...rest } = song
    return jsonOk({
      ...rest,
      // Flattened, matching how GET /api/song shapes a row for the list.
      popularity: puzzle.popularity,
      isBlocked: puzzle.isBlocked,
      lockedAt: song.lockedAt?.toISOString() ?? null,
    })
  } catch (error) {
    return internalErrorJson('admin.songs.patch', error)
  }
}

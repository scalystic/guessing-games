import { jsonError } from "@/lib/api/response";

/// RETIRED — YouTube-only.
///
/// This route served the audio a round had actually earned, sliced out of a clip
/// stored in R2. Every round now streams from YouTube, so there are no bytes for
/// this endpoint to meter: the client receives a video id and a hook offset in
/// the run/attempt payloads and plays through the YouTube IFrame API.
///
/// The route file survives, returning 410, rather than being deleted, because a
/// browser tab left open across the deploy still holds a run whose payload has
/// `audioUrl: "/api/runs/<id>/audio"`. A 410 with a named code says "this is gone
/// on purpose" instead of the 404 a missing file would give, which is
/// indistinguishable from a bad run id.
///
/// ---------------------------------------------------------------------------
/// What this did, and the reasoning that has to come back with it
/// ---------------------------------------------------------------------------
///
/// The whole reveal mechanism lived here: a puzzle had ONE stored clip, and stage
/// N was the first `stageByteOffsets[N - 1]` bytes of it. Only those bytes left
/// the bucket, so stage 1 moved ~6 KB rather than the full ~480 KB — there was
/// nothing further along in the response for a player to scrub into. That
/// mattered more at the end than it had earlier: the stored clip held 30s but the
/// ladder only ever unlocked 15s, so half of every object was audio no in-play
/// request was entitled to.
///
/// Note what was NOT in the URL: no puzzleId, no stage. Both were read
/// server-side from Run.currentRoundIndex and RunRound.stageReached, so a client
/// could not ask for a later stage by editing a path (docs/game-engine.md,
/// authority #3/#4).
///
/// `?reveal=1` was the one exception, and it did not weaken that. It served the
/// WHOLE stored clip for the most recently RESOLVED round — all 30s, including
/// the backup tail past the last rung that no in-play stage could reach. That was
/// the answer the result panel was already displaying. It could not reach an
/// unresolved round at all, so there was no stage to skip ahead to: the only
/// audio it could unlock belonged to a puzzle the player had already been told
/// the answer to. The round was picked as "latest resolved for this run" rather
/// than "the current round, if resolved" because resolving a round opens the next
/// one in the same transaction (game/attempt.ts advance()) — by the time the
/// panel was on screen, Run.currentRoundIndex had already moved on to a fresh
/// PENDING round.
///
/// THIS GUARANTEE DOES NOT SURVIVE THE MOVE TO YOUTUBE, and that is the real
/// cost of retiring this route. A YouTube round hands the client the full video
/// id and hook offset, and the clip length is enforced by a client-side timer in
/// components/PlayerBar.tsx (`handleYoutubePlay`). Reading one network response
/// gives a player the answer; patching the timer gives them the whole track.
/// Server-side metering is not reconstructible on top of an embedded player —
/// restoring it means restoring stored clips.
///
/// Restoring: `git log -- src/app/api/runs/[runId]/audio/route.ts` has the
/// implementation. The rest of the path is marked YOUTUBE-ONLY in
/// lib/game/selection.ts, lib/game/attempt.ts, api/runs/route.ts,
/// api/runs/[runId]/route.ts, api/games/[slug]/search/route.ts and
/// hooks/useMelodleGame.ts.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return jsonError(
    410,
    "stored_audio_retired",
    "Stored audio clips are retired; rounds stream from YouTube. Start a new run.",
  );
}

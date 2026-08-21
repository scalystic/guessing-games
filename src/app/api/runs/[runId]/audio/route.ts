import { prisma } from "@/lib/db";
import { jsonError, internalErrorJson } from "@/lib/api/response";
import { readRunToken, runTokenMatches } from "@/lib/game/run-token";
import { readPrefix } from "@/lib/storage";

/// Serves the audio the current round has actually earned.
///
/// The whole reveal mechanism lives here: a puzzle has ONE stored clip, and
/// stage N is the first `stageByteOffsets[N - 1]` bytes of it. Only those bytes
/// leave the bucket, so stage 1 moves ~3 KB rather than the full 112 KB — there
/// is nothing further along in the response for a player to scrub into.
///
/// Note what is NOT in the URL: no puzzleId, no stage. Both are read server-side
/// from Run.currentRoundIndex and RunRound.stageReached, so a client cannot ask
/// for a later stage by editing a path (docs/game-engine.md, authority #3/#4).
///
/// `?reveal=1` is the one exception, and it does not weaken that. It serves the
/// WHOLE clip for the most recently RESOLVED round — the answer the result panel
/// is already displaying. It cannot reach an unresolved round at all, so there is
/// no stage to skip ahead to: the only audio it can unlock belongs to a puzzle
/// the player has already been told the answer to. The round is picked as
/// "latest resolved for this run" rather than "the current round, if resolved"
/// because resolving a round opens the next one in the same transaction
/// (game/attempt.ts advance()) — by the time the panel is on screen,
/// Run.currentRoundIndex has already moved on to a fresh PENDING round.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/runs/[runId]/audio">,
): Promise<Response> {
  const { runId } = await ctx.params;
  const reveal = new URL(request.url).searchParams.get("reveal") === "1";

  try {
    const token = readRunToken(request);
    if (!token) {
      return jsonError(401, "missing_run_token", "Authorization: Bearer <run token> required.");
    }

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        tokenHash: true,
        status: true,
        currentRoundIndex: true,
        game: { select: { ladderRevision: true } },
      },
    });

    // Same response for "no such run" and "wrong token": distinguishing them
    // tells an attacker which run ids are real.
    if (!run || !runTokenMatches(token, run.tokenHash)) {
      return jsonError(404, "not_found", "No such run.");
    }

    // A completed run still has an answer to play back, so the reveal path
    // outlives the run itself. The in-play path does not.
    if (!reveal && run.status !== "IN_PROGRESS") {
      return jsonError(409, "run_not_in_progress", `Run is ${run.status}.`);
    }

    const roundSelect = {
      roundIndex: true,
      outcome: true,
      stageReached: true,
      puzzle: {
        select: {
          assets: {
            where: { kind: "AUDIO_CLIP" as const },
            select: { storageKey: true, stageByteOffsets: true, ladderRevision: true },
          },
        },
      },
    };

    const round = reveal
      ? await prisma.runRound.findFirst({
          where: { runId, outcome: { not: "PENDING" } },
          orderBy: { roundIndex: "desc" },
          select: roundSelect,
        })
      : await prisma.runRound.findUnique({
          where: { runId_roundIndex: { runId, roundIndex: run.currentRoundIndex } },
          select: roundSelect,
        });

    if (!round) {
      return reveal
        ? jsonError(409, "no_resolved_round", "This run has no resolved round to reveal.")
        : jsonError(409, "no_current_round", "This run has no round in progress.");
    }

    const asset = round.puzzle.assets[0];
    if (!asset) {
      // Selection filters these out, so reaching here means the asset was
      // deleted mid-run rather than a bad pick.
      return internalErrorJson(
        "runs.audio",
        new Error(`round ${run.currentRoundIndex} of run ${runId} has no AUDIO_CLIP`),
      );
    }

    // Stale offsets would serve a different amount of audio than the ladder
    // promises. Refuse rather than quietly mis-reveal; the fix is re-running
    // ingest, not retrying the request.
    if (asset.ladderRevision !== run.game.ladderRevision) {
      return internalErrorJson(
        "runs.audio",
        new Error(
          `asset ladderRevision ${asset.ladderRevision} != game ${run.game.ladderRevision}`,
        ),
      );
    }

    // The last offset is the end of the stored clip, so the reveal serves the
    // whole thing regardless of how far the player actually got.
    const servedStage = reveal ? asset.stageByteOffsets.length : round.stageReached;
    const endExclusive = asset.stageByteOffsets[servedStage - 1];
    if (endExclusive === undefined) {
      return internalErrorJson(
        "runs.audio",
        new Error(`stage ${servedStage} exceeds ${asset.stageByteOffsets.length} offsets`),
      );
    }

    const bytes = await readPrefix(asset.storageKey, endExclusive);

    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(bytes.length),
        // Never cached anywhere. The same URL returns more audio as the player
        // advances, so a cached stage-1 response would freeze the ladder — and a
        // shared cache would hand one player another's progress.
        "Cache-Control": "private, no-store, max-age=0",
        // A range request against this response would let the client probe past
        // what it earned. We already sliced; there is nothing to range over.
        "Accept-Ranges": "none",
        "X-Reveal-Stage": String(servedStage),
      },
    });
  } catch (error) {
    return internalErrorJson("runs.audio", error);
  }
}

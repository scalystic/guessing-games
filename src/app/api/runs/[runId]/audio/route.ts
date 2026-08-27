import { prisma } from "@/lib/db";
import { jsonError, internalErrorJson } from "@/lib/api/response";
import { readRunToken, runTokenMatches } from "@/lib/game/run-token";
import { readClipPrefix } from "@/lib/storage";

/// Serves the audio the current round has actually earned.
///
/// The whole reveal mechanism lives here: a puzzle has ONE stored clip, and
/// stage N is the first `stageByteOffsets[N - 1]` bytes of it. Only those bytes
/// leave the bucket, so stage 1 moves ~6 KB rather than the full ~480 KB — there
/// is nothing further along in the response for a player to scrub into. That
/// matters more now than it used to: the stored clip holds 30s but the ladder
/// only ever unlocks 15s, so half of every object is audio no in-play request is
/// entitled to.
///
/// Note what is NOT in the URL: no puzzleId, no stage. Both are read server-side
/// from Run.currentRoundIndex and RunRound.stageReached, so a client cannot ask
/// for a later stage by editing a path (docs/game-engine.md, authority #3/#4).
///
/// `?reveal=1` is the one exception, and it does not weaken that. It serves the
/// WHOLE stored clip for the most recently RESOLVED round — all 30s, including
/// the backup tail past the last rung that no in-play stage can reach. That is
/// the answer the result panel is already displaying. It cannot reach an
/// unresolved round at all, so there is
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

    // One statement for the run, its game's ladder revision, the relevant round
    // and that round's asset. This used to be two sequential queries, and on a
    // remote database each one is a full round trip — the reveal fetch runs on
    // every resolved round, so that was ~100ms of pure waiting per round for a
    // join the database can do itself.
    //
    // The LATERAL picks the round both callers need: the newest resolved round
    // for `?reveal=1`, the current round otherwise. `ORDER BY roundIndex DESC`
    // is what makes the reveal branch "latest resolved" — see the note above on
    // why the current round is the wrong one to reveal.
    type Row = {
      token_hash: string;
      status: string;
      game_ladder_revision: number;
      stage_reached: number | null;
      storage_key: string | null;
      stage_byte_offsets: number[] | null;
      byte_size: number | null;
      asset_ladder_revision: number | null;
    };

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        r."tokenHash"        AS token_hash,
        r.status::text       AS status,
        g."ladderRevision"   AS game_ladder_revision,
        rr."stageReached"    AS stage_reached,
        a."storageKey"       AS storage_key,
        a."stageByteOffsets" AS stage_byte_offsets,
        a."byteSize"         AS byte_size,
        a."ladderRevision"   AS asset_ladder_revision
      FROM "Run" r
      JOIN "Game" g
        ON g.id = r."gameId"
      LEFT JOIN LATERAL (
        SELECT x."stageReached", x."puzzleId"
        FROM "RunRound" x
        WHERE x."runId" = r.id
          AND CASE
                WHEN ${reveal} THEN x.outcome <> 'PENDING'
                ELSE x."roundIndex" = r."currentRoundIndex"
              END
        ORDER BY x."roundIndex" DESC
        LIMIT 1
      ) rr ON true
      LEFT JOIN "PuzzleAsset" a
        ON a."puzzleId" = rr."puzzleId" AND a.kind = 'AUDIO_CLIP'::"AssetKind"
      WHERE r.id = ${runId}
    `;

    const row = rows[0];

    // Same response for "no such run" and "wrong token": distinguishing them
    // tells an attacker which run ids are real.
    if (!row || !runTokenMatches(token, row.token_hash)) {
      return jsonError(404, "not_found", "No such run.");
    }

    // A completed run still has an answer to play back, so the reveal path
    // outlives the run itself. The in-play path does not.
    if (!reveal && row.status !== "IN_PROGRESS") {
      return jsonError(409, "run_not_in_progress", `Run is ${row.status}.`);
    }

    if (row.stage_reached === null) {
      return reveal
        ? jsonError(409, "no_resolved_round", "This run has no resolved round to reveal.")
        : jsonError(409, "no_current_round", "This run has no round in progress.");
    }

    const round = { stageReached: row.stage_reached };
    const run = { game: { ladderRevision: row.game_ladder_revision } };
    const asset =
      row.storage_key !== null &&
      row.stage_byte_offsets !== null &&
      row.asset_ladder_revision !== null
        ? {
            storageKey: row.storage_key,
            stageByteOffsets: row.stage_byte_offsets,
            byteSize: row.byte_size,
            ladderRevision: row.asset_ladder_revision,
          }
        : null;

    if (!asset) {
      // Selection filters these out, so reaching here means the asset was
      // deleted mid-run rather than a bad pick.
      return internalErrorJson(
        "runs.audio",
        new Error(`the served round of run ${runId} has no AUDIO_CLIP`),
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

    // The reveal serves byteSize, NOT the last stage offset: the stored clip runs
    // past the final rung (30s stored, 15s reachable in play), and stopping at the
    // last offset would throw the backup tail away for the one caller entitled to
    // it. byteSize is nullable in the schema, so fall back to the last rung —
    // that is the pre-backup-tail behaviour and is always safe.
    const servedStage = reveal ? asset.stageByteOffsets.length : round.stageReached;
    const stageEnd = asset.stageByteOffsets[servedStage - 1];
    if (stageEnd === undefined) {
      return internalErrorJson(
        "runs.audio",
        new Error(`stage ${servedStage} exceeds ${asset.stageByteOffsets.length} offsets`),
      );
    }
    const endExclusive = reveal ? (asset.byteSize ?? stageEnd) : stageEnd;

    // Cached per process: a six-attempt round walks six growing prefixes of ONE
    // object, and each of those used to be its own range request to R2.
    const bytes = await readClipPrefix(asset.storageKey, endExclusive, asset.byteSize);

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

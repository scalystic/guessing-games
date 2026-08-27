import { z } from "zod";
import { prisma } from "@/lib/db";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { ensurePlayer } from "@/lib/guest";
import { mintRunToken } from "@/lib/game/run-token";
import { samplePuzzle } from "@/lib/game/selection";
import { inlineAudioFor } from "@/lib/game/attempt";
import { randomBytes, randomUUID } from "crypto";

/// POST /api/runs — start a run.
///
/// v1 serves PRACTICE. DAILY needs a published DailyChallenge to draw its frozen
/// puzzle set from, so it is rejected here rather than silently behaving like
/// practice: a daily that sampled per-player would break the one property that
/// makes the board comparable.

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  gameSlug: z.string().min(1),
  mode: z.enum(["DAILY", "PRACTICE", "ENDLESS"]).default("PRACTICE"),
  /// Era category to sample from. Omitted/null = every era.
  decadeFilter: z.enum(["NINETIES", "TWO_THOUSANDS"]).nullish(),
});

const RUN_TTL_MINUTES = Number.parseInt(process.env.RUN_TTL_MINUTES ?? "180", 10);

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "invalid_body", "Expected { gameSlug, mode? }.");
    }
    const { gameSlug, mode, decadeFilter } = parsed.data;

    if (mode !== "PRACTICE") {
      return jsonError(501, "mode_unavailable", `${mode} is not wired up yet.`);
    }

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: {
        id: true,
        maxAttempts: true,
        livesPerRun: true,
        scoringVersion: true,
        puzzleCooldownDays: true,
        startPopularity: true,
        rampPerRound: true,
        minPopularity: true,
        sampleWindow: true,
        ladderRevision: true,
      },
    });
    if (!game) return jsonError(404, "not_found", `No active game "${gameSlug}".`);

    const { playerId } = await ensurePlayer(clientIp(request));

    const pick = await samplePuzzle({
      gameId: game.id,
      playerId,
      roundIndex: 1,
      curve: game,
      maxAttempts: game.maxAttempts,
      cooldownDays: game.puzzleCooldownDays,
      excludePuzzleIds: [],
      decadeFilter,
    });

    // An empty catalog and an exhausted one are the same thing to the player.
    if (!pick) {
      return jsonError(
        503,
        "catalog_empty",
        "No playable puzzles are available right now.",
      );
    }

    const { token, tokenHash } = mintRunToken();

    // Both inserts in one statement. Prisma's nested create wraps them in a
    // transaction, which against a remote database is BEGIN + INSERT + INSERT +
    // COMMIT — four round trips for two rows. A data-modifying CTE is one, and
    // is just as atomic.
    //
    // Columns with database defaults (status, currentRoundIndex, score, the
    // streak counters, version, startedAt) are deliberately omitted; raw SQL
    // bypasses Prisma's client-side defaults but the column defaults still apply.
    const runId = randomUUID();
    const rows = await prisma.$queryRaw<{ lives_remaining: number; current_round_index: number }[]>`
      WITH r AS (
        INSERT INTO "Run" (
          id, "gameId", "playerId", mode, "dayKey", seed, "decadeFilter",
          "livesRemaining", "maxRounds", "scoringVersion", "isRanked",
          "tokenHash", "expiresAt"
        )
        VALUES (
          ${runId}, ${game.id}, ${playerId}, ${mode}::"RunMode",
          -- NULL dayKey is what makes practice unlimited: the
          -- @@unique([playerId, gameId, dayKey]) that caps DAILY at one per day
          -- doesn't constrain NULLs, since Postgres treats them as distinct.
          NULL, ${randomBytes(16).toString("hex")}, ${decadeFilter ?? null}::"RunEra",
          ${game.livesPerRun}, NULL, ${game.scoringVersion}, false,
          ${tokenHash}, ${new Date(Date.now() + RUN_TTL_MINUTES * 60 * 1000)}
        )
        RETURNING id, "livesRemaining", "currentRoundIndex"
      ),
      rr AS (
        INSERT INTO "RunRound" (
          id, "runId", "roundIndex", "puzzleId",
          "targetPopularity", "puzzlePopularity"
        )
        SELECT ${randomUUID()}, r.id, 1, ${pick.puzzleId},
               ${pick.targetPopularity}, ${pick.popularity}
        FROM r
        RETURNING id
      )
      SELECT
        r."livesRemaining"    AS lives_remaining,
        r."currentRoundIndex" AS current_round_index
      FROM r, rr
    `;

    const created = rows[0];
    if (!created) {
      return internalErrorJson("runs.start", new Error("run insert returned no row"));
    }
    const run = {
      id: runId,
      livesRemaining: created.lives_remaining,
      currentRoundIndex: created.current_round_index,
    };

    // Stage 1 rides along with the response. `begin()` on the client used to
    // await this call and THEN fetch /audio, so starting a run cost two serial
    // round trips before the player heard anything. The bytes are the same ones
    // `audioUrl` serves, and the round is already open, so nothing is revealed
    // early. Falls back to null — and therefore to the route — if the asset is
    // unservable for any reason.
    const nextAudio = await inlineAudioFor(pick.asset, 1, game.ladderRevision);

    // The token is returned exactly once and never persisted in raw form.
    return jsonOk({
      runId: run.id,
      runToken: token,
      mode,
      decadeFilter: decadeFilter ?? null,
      roundIndex: run.currentRoundIndex,
      stageReached: 1,
      attemptsRemaining: game.maxAttempts,
      livesRemaining: run.livesRemaining,
      audioUrl: `/api/runs/${run.id}/audio`,
      nextAudio,
    });
  } catch (error) {
    return internalErrorJson("runs.start", error);
  }
}

import { z } from "zod";
import { prisma } from "@/lib/db";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { ensurePlayer } from "@/lib/guest";
import { mintRunToken } from "@/lib/game/run-token";
import { samplePuzzle } from "@/lib/game/selection";
import { randomBytes } from "crypto";

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
    const { gameSlug, mode } = parsed.data;

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

    const run = await prisma.run.create({
      data: {
        gameId: game.id,
        playerId,
        mode,
        // NULL dayKey is what makes practice unlimited: the
        // @@unique([playerId, gameId, dayKey]) that caps DAILY at one per day
        // doesn't constrain NULLs, since Postgres treats them as distinct.
        dayKey: null,
        seed: randomBytes(16).toString("hex"),
        livesRemaining: game.livesPerRun,
        maxRounds: null,
        scoringVersion: game.scoringVersion,
        isRanked: false,
        tokenHash,
        expiresAt: new Date(Date.now() + RUN_TTL_MINUTES * 60 * 1000),
        rounds: {
          create: {
            roundIndex: 1,
            puzzleId: pick.puzzleId,
            targetPopularity: pick.targetPopularity,
            puzzlePopularity: pick.popularity,
          },
        },
      },
      select: { id: true, livesRemaining: true, currentRoundIndex: true },
    });

    // The token is returned exactly once and never persisted in raw form.
    return jsonOk({
      runId: run.id,
      runToken: token,
      mode,
      roundIndex: run.currentRoundIndex,
      stageReached: 1,
      attemptsRemaining: game.maxAttempts,
      livesRemaining: run.livesRemaining,
      audioUrl: `/api/runs/${run.id}/audio`,
    });
  } catch (error) {
    return internalErrorJson("runs.start", error);
  }
}

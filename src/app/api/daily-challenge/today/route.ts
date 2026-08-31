import { prisma } from "@/lib/db";
import { ensurePlayer } from "@/lib/guest";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

export const dynamic = "force-dynamic";

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? null;
}

/**
 * GET /api/daily-challenge/today?gameSlug=<slug>
 *
 * Returns today's published daily challenge info. Also returns whether the
 * current player has already started a run for it.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const gameSlug = url.searchParams.get("gameSlug") ?? "songless";

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: { id: true },
    });
    if (!game) return jsonError(404, "not_found", `No active game "${gameSlug}".`);

    const todayKey = new Date().toISOString().slice(0, 10);

    const challenge = await prisma.dailyChallenge.findFirst({
      where: { gameId: game.id, dayKey: todayKey, publishedAt: { not: null } },
      select: {
        id: true,
        title: true,
        dayKey: true,
        roundCount: true,
        rewardCoins: true,
        rewardXp: true,
        publishedAt: true,
      },
    });

    if (!challenge) {
      return jsonError(404, "no_challenge_today", "No daily challenge for today.");
    }

    const { playerId } = await ensurePlayer(clientIp(request));

    const existingRun = await prisma.run.findFirst({
      where: { playerId, gameId: game.id, dailyChallengeId: challenge.id },
      select: {
        id: true,
        status: true,
        rounds: { select: { attemptsUsed: true } },
      },
    });

    // Only block re-entry once the player has actually made a guess.
    // A run that was created on page load but never interacted with should
    // not prevent the player from coming back and playing.
    const hasGuesses = existingRun !== null &&
      existingRun.rounds.some((r) => r.attemptsUsed > 0);

    return jsonOk({
      id: challenge.id,
      title: challenge.title,
      dayKey: challenge.dayKey,
      roundCount: challenge.roundCount,
      rewardCoins: challenge.rewardCoins,
      rewardXp: challenge.rewardXp,
      alreadyPlayed: hasGuesses,
      runStatus: hasGuesses ? (existingRun?.status ?? null) : null,
    });
  } catch (error) {
    return internalErrorJson("daily-challenge.today", error);
  }
}

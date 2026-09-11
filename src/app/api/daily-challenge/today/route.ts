import { prisma } from "@/lib/db";
import { getExistingPlayerId } from "@/lib/guest";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/daily-challenge/today?gameSlug=<slug>
 *
 * Returns today's published daily challenge info. Also returns whether the
 * current player has already started a run for it.
 *
 * Reads the identity, never mints one — getExistingPlayerId, not ensurePlayer.
 * A GET that provisions a guest is a write, and this one raced: the daily page
 * fires this, /history and /leaderboard at the same moment, so on a first
 * visit all three found no cookie, each created its own Player, and each set
 * its own session cookie. One of those cookies won at random, which left the
 * run, the name and the history belonging to three different players — the
 * board row showing "Player" with no name, and a played day that never
 * checked. Minting belongs to the POSTs (see /api/runs), which arrive one at
 * a time.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const gameSlug = url.searchParams.get("gameSlug") ?? "songless";

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: { id: true, maxAttempts: true },
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

    // No session yet means no runs yet, so there is nothing to look up and
    // "not played" is the right answer.
    const playerId = await getExistingPlayerId();

    // Matched on dayKey, not dailyChallengeId — the same reasoning as the
    // POST /api/runs "existing run" check: dailyChallengeId is
    // ON DELETE SET NULL, so a run against a since-edited-or-recreated
    // challenge for today would otherwise go undetected here while still
    // being very much there, and still enforced by the DB's
    // @@unique([playerId, gameId, dayKey]). Reporting alreadyPlayed: false in
    // that case renders the game screen for a run that /api/runs will then
    // reject with 409 the moment it tries to start.
    const existingRun = playerId === null ? null : await prisma.run.findFirst({
      where: { playerId, gameId: game.id, dayKey: todayKey },
      select: {
        id: true,
        status: true,
        score: true,
        roundsSolved: true,
        rounds: {
          orderBy: { roundIndex: "asc" },
          select: { attemptsUsed: true, outcome: true },
        },
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
      result:
        hasGuesses && existingRun?.status === "COMPLETED"
          ? {
              score: existingRun.score,
              roundsSolved: existingRun.roundsSolved,
              maxAttempts: game.maxAttempts,
              roundHistory: existingRun.rounds
                .filter((round) => round.outcome !== "PENDING")
                .map((round) => ({
                  solved: round.outcome === "SOLVED",
                  attemptsUsed: round.attemptsUsed,
                })),
            }
          : null,
    });
  } catch (error) {
    return internalErrorJson("daily-challenge.today", error);
  }
}

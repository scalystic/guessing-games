import { prisma } from "@/lib/db";
import { getExistingPlayerId } from "@/lib/guest";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";
import {
  EMPTY_LIFETIME_STATS,
  computeProgression,
  type PlayerLifetimeStats,
} from "@/lib/game/progression";

export const dynamic = "force-dynamic";

/// GET /api/players/stats?gameSlug=<slug>
///
/// This player's LIFETIME totals for one game, plus the level, rank and badge
/// ladder derived from them. The single source of progression in the app —
/// the attempt responses used to carry their own copy computed from one run,
/// which is why a player's level reset every time they started a set.
///
/// Read-only, and deliberately does not mint a guest: same reasoning as the
/// daily history route. A visitor who has never played gets a zeroed row rather
/// than a 404, so the panel renders its empty state instead of an error — and
/// so the badge grid shows what there is to play for before you have played.
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const gameSlug = url.searchParams.get("gameSlug") ?? "songless";

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: { id: true },
    });
    if (!game) return jsonError(404, "not_found", `No active game "${gameSlug}".`);

    const playerId = await getExistingPlayerId();

    const row =
      playerId === null
        ? null
        : await prisma.playerGameStat.findUnique({
            where: { playerId_gameId: { playerId, gameId: game.id } },
            select: {
              runsPlayed: true,
              roundsPlayed: true,
              roundsSolved: true,
              bestRunScore: true,
              bestDailyScore: true,
              bestRoundStreak: true,
              currentDailyStreak: true,
              longestDailyStreak: true,
              xp: true,
            },
          });

    const stats: PlayerLifetimeStats = row ?? EMPTY_LIFETIME_STATS;

    return jsonOk({
      /// False for a visitor with no rollup row yet — the panel uses it to
      /// distinguish "nothing played" from "played and scored zero".
      hasPlayed: row !== null && row.runsPlayed > 0,
      stats,
      progression: computeProgression(stats),
    });
  } catch (error) {
    return internalErrorJson("players.stats", error);
  }
}

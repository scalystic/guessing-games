import { prisma } from "@/lib/db";
import { getExistingPlayerId } from "@/lib/guest";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

export const dynamic = "force-dynamic";

type BoardRow = {
  rank: bigint;
  player_id: string;
  display_name: string | null;
  rounds_played: number;
  rounds_solved: number;
  instant_solve_count: number;
};

/// GET /api/leaderboard/stats?gameSlug=<slug>&limit=<n>&offset=<n>
///
/// The lifetime board: every player who has completed at least one run,
/// ranked by how many songs they've named on the very first listen — the
/// reveal ladder's first stage is a 400ms clip, so attemptsUsed = 1 on a
/// SOLVED round is "guessed in 0.4 seconds". Reads PlayerGameStat, rolled up
/// by rollUpPlayerStats() in src/lib/game/attempt.ts when a run completes;
/// this route never touches Run or RunRound directly.
///
/// Unlike the daily board (LeaderboardEntry, scoped to one day's periodKey),
/// this is all-time and has no period — one row per player per game, already
/// exactly what PlayerGameStat stores.
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const gameSlug = url.searchParams.get("gameSlug") ?? "songless";
    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const requestedOffset = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 50;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(0, Math.floor(requestedOffset))
      : 0;

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: { id: true },
    });
    if (!game) return jsonError(404, "not_found", `No active game "${gameSlug}".`);

    // Order: most 0.4s guesses first, then total correct, then total played —
    // each a tie-break on the one before it — then playerId for a stable sort.
    const entries = await prisma.$queryRaw<BoardRow[]>`
      SELECT
        RANK() OVER (
          ORDER BY pgs."instantSolveCount" DESC, pgs."roundsSolved" DESC, pgs."roundsPlayed" DESC
        ) AS rank,
        pgs."playerId"          AS player_id,
        COALESCE(p.handle, p."displayName") AS display_name,
        pgs."roundsPlayed"      AS rounds_played,
        pgs."roundsSolved"      AS rounds_solved,
        pgs."instantSolveCount" AS instant_solve_count
      FROM "PlayerGameStat" pgs
      JOIN "Player" p ON p.id = pgs."playerId"
      WHERE pgs."gameId" = ${game.id} AND pgs."roundsPlayed" > 0
      ORDER BY
        pgs."instantSolveCount" DESC, pgs."roundsSolved" DESC, pgs."roundsPlayed" DESC,
        pgs."playerId" ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Read-only: never mints a guest. Same reasoning as the daily leaderboard
    // route — a GET that provisions an identity races the other reads on
    // first load and can split one visitor across several Player rows.
    const playerId = await getExistingPlayerId();
    const inPage = playerId === null ? undefined : entries.find((e) => e.player_id === playerId);

    let you: {
      rank: number;
      roundsPlayed: number;
      roundsSolved: number;
      instantSolveCount: number;
      displayName: string | null;
    } | null = null;

    if (inPage) {
      you = {
        rank: Number(inPage.rank),
        roundsPlayed: inPage.rounds_played,
        roundsSolved: inPage.rounds_solved,
        instantSolveCount: inPage.instant_solve_count,
        displayName: inPage.display_name,
      };
    } else if (playerId !== null) {
      const own = await prisma.playerGameStat.findUnique({
        where: { playerId_gameId: { playerId, gameId: game.id } },
        select: {
          roundsPlayed: true,
          roundsSolved: true,
          instantSolveCount: true,
          player: { select: { handle: true, displayName: true } },
        },
      });
      if (own && own.roundsPlayed > 0) {
        const better = await prisma.playerGameStat.count({
          where: {
            gameId: game.id,
            roundsPlayed: { gt: 0 },
            OR: [
              { instantSolveCount: { gt: own.instantSolveCount } },
              {
                instantSolveCount: own.instantSolveCount,
                roundsSolved: { gt: own.roundsSolved },
              },
              {
                instantSolveCount: own.instantSolveCount,
                roundsSolved: own.roundsSolved,
                roundsPlayed: { gt: own.roundsPlayed },
              },
            ],
          },
        });
        you = {
          rank: better + 1,
          roundsPlayed: own.roundsPlayed,
          roundsSolved: own.roundsSolved,
          instantSolveCount: own.instantSolveCount,
          displayName: own.player.handle ?? own.player.displayName,
        };
      }
    }

    const total = await prisma.playerGameStat.count({
      where: { gameId: game.id, roundsPlayed: { gt: 0 } },
    });

    return jsonOk({
      total,
      entries: entries.map((e) => ({
        rank: Number(e.rank),
        playerId: e.player_id,
        displayName: e.display_name ?? "Player",
        roundsPlayed: e.rounds_played,
        roundsSolved: e.rounds_solved,
        instantSolveCount: e.instant_solve_count,
        isYou: e.player_id === playerId,
      })),
      you,
    });
  } catch (error) {
    return internalErrorJson("leaderboard.stats", error);
  }
}

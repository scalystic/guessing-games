import { prisma } from "@/lib/db";
import { getExistingPlayerId } from "@/lib/guest";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

export const dynamic = "force-dynamic";

type BoardRow = {
  rank: bigint;
  player_id: string;
  display_name: string | null;
  score: number;
  tie_break_reveal_ms: number | null;
};

/// GET /api/daily-challenge/leaderboard?gameSlug=<slug>&dayKey=<YYYY-MM-DD>&limit=<n>
///
/// Reads LeaderboardEntry, upserted by completeRun() in src/lib/game/attempt.ts
/// when a DAILY run finishes — this route never touches Run directly. `rank`
/// is a window function over the read, matching the "recomputed, never
/// trusted as truth" comment on LeaderboardEntry.rank in the schema.
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const gameSlug = url.searchParams.get("gameSlug") ?? "songless";
    const dayKey = url.searchParams.get("dayKey") ?? new Date().toISOString().slice(0, 10);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: { id: true },
    });
    if (!game) return jsonError(404, "not_found", `No active game "${gameSlug}".`);

    const entries = await prisma.$queryRaw<BoardRow[]>`
      SELECT
        RANK() OVER (ORDER BY le.score DESC, le."tieBreakRevealMs" ASC NULLS LAST) AS rank,
        le."playerId"          AS player_id,
        -- handle first: it is the unique, public username every account holds,
        -- and the only one of the two that cannot collide. displayName is the
        -- fallback for guests, who have no handle and may have named
        -- themselves via the multiplayer picker; a guest with neither falls
        -- through to "Player" in the mapping below.
        COALESCE(p.handle, p."displayName") AS display_name,
        le.score                AS score,
        le."tieBreakRevealMs"  AS tie_break_reveal_ms
      FROM "LeaderboardEntry" le
      JOIN "Player" p ON p.id = le."playerId"
      WHERE le."gameId" = ${game.id}
        AND le."boardType" = 'DAILY'::"BoardType"
        AND le."periodKey" = ${dayKey}
      ORDER BY le.score DESC, le."tieBreakRevealMs" ASC NULLS LAST
      LIMIT ${limit}
    `;

    // Read-only: never mints a guest. See the note on the /today route — a GET
    // that provisions an identity raced the other two on first load and split
    // one visitor across several Player rows, so a player's own board row came
    // back as someone else's ("Player", no isYou).
    //
    // A viewer with no session simply has no row here, which is right: they
    // have not finished a run, so they are not on the board.
    const playerId = await getExistingPlayerId();
    const inTop = playerId === null ? undefined : entries.find((e) => e.player_id === playerId);

    // The viewer's own row even when it falls outside the page — the count
    // of strictly-better entries is one cheaper query than re-ranking
    // everything, and only runs when the viewer didn't already show up above.
    // Carries displayName as well as the placement: the client renders this row
    // as "<name> (You)", same as an in-page row, and the name is the half it
    // cannot derive on its own.
    let you: { rank: number; score: number; displayName: string | null } | null = null;
    if (inTop) {
      you = {
        rank: Number(inTop.rank),
        score: inTop.score,
        displayName: inTop.display_name,
      };
    } else if (playerId !== null) {
      const own = await prisma.leaderboardEntry.findUnique({
        where: {
          gameId_boardType_periodKey_playerId: {
            gameId: game.id,
            boardType: "DAILY",
            periodKey: dayKey,
            playerId,
          },
        },
        select: {
          score: true,
          tieBreakRevealMs: true,
          player: { select: { handle: true, displayName: true } },
        },
      });
      if (own) {
        const better = await prisma.leaderboardEntry.count({
          where: {
            gameId: game.id,
            boardType: "DAILY",
            periodKey: dayKey,
            OR: [
              { score: { gt: own.score } },
              {
                score: own.score,
                tieBreakRevealMs: { lt: own.tieBreakRevealMs ?? undefined },
              },
            ],
          },
        });
        you = {
          rank: better + 1,
          score: own.score,
          // Same precedence as the SELECT above.
          displayName: own.player.handle ?? own.player.displayName,
        };
      }
    }

    // How many players finished today — the share poster prints the viewer's
    // rank as "#4 of 128", which needs the field size, not just the page.
    const total = await prisma.leaderboardEntry.count({
      where: { gameId: game.id, boardType: "DAILY", periodKey: dayKey },
    });

    return jsonOk({
      dayKey,
      total,
      entries: entries.map((e) => ({
        rank: Number(e.rank),
        playerId: e.player_id,
        displayName: e.display_name ?? "Player",
        score: e.score,
        isYou: e.player_id === playerId,
      })),
      you,
    });
  } catch (error) {
    return internalErrorJson("daily-challenge.leaderboard", error);
  }
}

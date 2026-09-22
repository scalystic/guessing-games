import "server-only";
import { prisma } from "@/lib/db";

/// DAILY mode plays the challenge's OWN song list, in the order the admin set.
///
/// A daily challenge walks its DailyChallengePuzzle entries by `roundIndex`:
/// round 1 is the admin's first pick, round N its Nth. Every player on that day
/// gets the same songs in the same order, so the board stays comparable, and the
/// run is exactly as long as the list the admin built (72 songs in, 72 rounds
/// out). No seed shuffling and no catalog-wide walk — those made the daily play
/// songs nobody picked and ignored the curated list entirely.
///
/// Two kinds of entry get dropped:
///
///   - nothing to stream (`Song.externalId IS NULL`) — a round with no video is
///     a dead round. Entries are otherwise played as picked; isActive/isLocked
///     are admin-side catalog flags and an explicit pick outranks them.
///   - a song already picked earlier in the same list. `RunRound` is UNIQUE on
///     (runId, puzzleId), so a repeat is not "play it twice", it is a 500 that
///     kills the run mid-game — which is exactly what the 72-song Sargam list
///     did at song 43 (it lists three songs twice). First occurrence wins; the
///     repeat is dropped, and the run is as long as the DISTINCT list.
///
/// Because a dropped entry leaves a hole in `roundIndex`, positions are
/// re-numbered with ROW_NUMBER over the surviving entries. That is what the run's
/// round index addresses, so rounds are always 1..N with no gaps.

type RawExecutor = Pick<typeof prisma, "$queryRaw">;

/// How many rounds today's daily runs — the number of playable entries on the
/// challenge. This becomes the run's maxRounds, so the client shows the right
/// total and the run completes once every picked song has been played.
export async function countDailyChallengeRounds(
  dailyChallengeId: string,
  db: RawExecutor = prisma,
): Promise<number> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(DISTINCT d."puzzleId")::int AS n
    FROM "DailyChallengePuzzle" d
    JOIN "Song" s ON s."puzzleId" = d."puzzleId"
    WHERE d."dailyChallengeId" = ${dailyChallengeId}
      AND s."externalId" IS NOT NULL
  `;
  return rows[0]?.n ?? 0;
}

export type DailyPuzzle = {
  puzzleId: string;
  popularity: number;
  youtubeVideoId: string;
  hookStartMs: number;
};

/// The song at `position` (1-based) in the challenge's list — position 1 for the
/// run's first round, 2 for its second, and so on. Returns null past the end of
/// the list, which is what completes the run.
export async function dailyPuzzleAt(
  args: { dailyChallengeId: string; position: number },
  db: RawExecutor = prisma,
): Promise<DailyPuzzle | null> {
  const rows = await db.$queryRaw<
    { id: string; popularity: number; external_id: string; hook_start_ms: number }[]
  >`
    WITH picks AS (
      -- One row per song, at the earliest roundIndex the admin gave it.
      SELECT DISTINCT ON (d."puzzleId")
        d."puzzleId",
        d."roundIndex"
      FROM "DailyChallengePuzzle" d
      JOIN "Song" s ON s."puzzleId" = d."puzzleId"
      WHERE d."dailyChallengeId" = ${args.dailyChallengeId}
        AND s."externalId" IS NOT NULL
      ORDER BY d."puzzleId", d."roundIndex"
    )
    SELECT id, popularity, external_id, hook_start_ms
    FROM (
      SELECT
        p.id,
        p.popularity,
        s."externalId"               AS external_id,
        COALESCE(s."hookStartMs", 0) AS hook_start_ms,
        ROW_NUMBER() OVER (ORDER BY picks."roundIndex") AS position
      FROM picks
      JOIN "Puzzle" p ON p.id = picks."puzzleId"
      JOIN "Song" s ON s."puzzleId" = p.id
    ) ordered
    WHERE position = ${args.position}
  `;

  const row = rows[0];
  if (!row) return null;
  return {
    puzzleId: row.id,
    popularity: row.popularity,
    youtubeVideoId: row.external_id,
    hookStartMs: row.hook_start_ms,
  };
}

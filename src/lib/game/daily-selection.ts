import "server-only";
import { prisma } from "@/lib/db";

/// DAILY mode plays through the WHOLE eligible catalog, not a hand-picked set.
///
/// A daily challenge no longer draws from its DailyChallengePuzzle entries; it
/// walks every playable song for the game exactly once, in a fixed order that is
/// the same for every player on that day. "Eligible" is the same predicate the
/// practice sampler enforces (see samplePuzzle in selection.ts) minus the
/// per-round popularity window, the per-player cooldown, and any decade filter:
///
///   - Puzzle.isActive AND NOT Puzzle.isBlocked
///   - Song.externalId IS NOT NULL   (there is a YouTube video to stream)
///   - Song.isLocked = true          (an admin reviewed where the hook starts)
///
/// The order is `md5(<challenge seed> || puzzleId)`: total, stable, and shared
/// across players because the seed is a property of the DailyChallenge, not the
/// run. That is what keeps the daily board comparable even though nobody picked
/// the songs by hand.

type RawExecutor = Pick<typeof prisma, "$queryRaw">;

/// How many songs today's daily will run through — the size of the eligible set.
/// This becomes the run's maxRounds, so the client shows the right total and the
/// run completes once every eligible song has been played.
export async function countDailyEligiblePuzzles(
  gameId: string,
  db: RawExecutor = prisma,
): Promise<number> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "Puzzle" p
    JOIN "Song" s ON s."puzzleId" = p.id
    WHERE p."gameId" = ${gameId}
      AND p."isActive" = true
      AND p."isBlocked" = false
      AND s."externalId" IS NOT NULL
      AND s."isLocked" = true
  `;
  return rows[0]?.n ?? 0;
}

export type DailyPuzzle = {
  puzzleId: string;
  popularity: number;
  youtubeVideoId: string;
  hookStartMs: number;
};

/// The next eligible song for a daily run, in the day's fixed order, skipping the
/// ones this run has already played (`excludePuzzleIds`). Returns null when the
/// whole eligible set has been walked — the run then completes.
///
/// Ordering by md5(seed || id) rather than an index means a song being locked or
/// blocked mid-day only adds/removes it from the tail of the sequence; it never
/// renumbers the songs a player has already seen.
export async function nextDailyPuzzle(
  args: { gameId: string; seed: string; excludePuzzleIds: string[] },
  db: RawExecutor = prisma,
): Promise<DailyPuzzle | null> {
  const rows = await db.$queryRaw<
    { id: string; popularity: number; external_id: string; hook_start_ms: number }[]
  >`
    SELECT
      p.id,
      p.popularity,
      s."externalId"               AS external_id,
      COALESCE(s."hookStartMs", 0)  AS hook_start_ms
    FROM "Puzzle" p
    JOIN "Song" s ON s."puzzleId" = p.id
    WHERE p."gameId" = ${args.gameId}
      AND p."isActive" = true
      AND p."isBlocked" = false
      AND s."externalId" IS NOT NULL
      AND s."isLocked" = true
      AND p.id <> ALL(${args.excludePuzzleIds}::text[])
    ORDER BY md5(${args.seed} || p.id)
    LIMIT 1
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

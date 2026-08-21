import "server-only";
import { prisma } from "@/lib/db";

/// Puzzle selection. Difficulty ramps WITHIN a run: round 1 targets the top of
/// the catalog and each later round slides toward obscurity. There are no
/// difficulty tiers — see docs/game-engine.md § Puzzle selection.

export type SelectionCurve = {
  startPopularity: number;
  rampPerRound: number;
  minPopularity: number;
  sampleWindow: number;
};

/// Where round N should sit on the 0-100 popularity axis. Seeded at 90 / -3.5 /
/// floor 20, a 10-round day walks 90 → 58.5.
export function targetPopularity(curve: SelectionCurve, roundIndex: number): number {
  const raw = curve.startPopularity - curve.rampPerRound * (roundIndex - 1);
  return Math.min(100, Math.max(curve.minPopularity, raw));
}

/// Progressive widening. If the catalog is thin at a percentile, a fixed window
/// would fail the round outright; each retry doubles the window and the last
/// ignores it entirely so a run can always continue.
const WINDOW_MULTIPLIERS = [1, 2, 4, Number.POSITIVE_INFINITY];

export type SampleArgs = {
  gameId: string;
  playerId: string;
  roundIndex: number;
  curve: SelectionCurve;
  maxAttempts: number;
  /// Rounds without a repeat for the same player.
  cooldownDays: number;
  /// Puzzles already used in this run. @@unique([runId, puzzleId]) is the hard
  /// stop, but excluding them here avoids burning a retry on a guaranteed clash.
  excludePuzzleIds: string[];
};

export type SampledPuzzle = {
  puzzleId: string;
  popularity: number;
  targetPopularity: number;
};

type Row = { id: string; popularity: number };

/// Pick one playable puzzle near the round's target popularity.
///
/// "Playable" is doing real work here: a puzzle with no AUDIO_CLIP, or one whose
/// stageByteOffsets don't cover every stage, would hand the player a round that
/// 404s partway up the ladder. Those are filtered in SQL rather than discovered
/// at serve time.
export async function samplePuzzle(args: SampleArgs): Promise<SampledPuzzle | null> {
  const target = targetPopularity(args.curve, args.roundIndex);
  const cooldownCutoff = new Date(Date.now() - args.cooldownDays * 24 * 60 * 60 * 1000);

  for (const multiplier of WINDOW_MULTIPLIERS) {
    const window = args.curve.sampleWindow * multiplier;
    // Puzzle.popularity is an integer column but rampPerRound is a float, so a
    // target like 86.5 yields fractional bounds that Postgres rejects outright.
    // Floor/ceil rather than round, so rounding always widens the window and
    // never quietly narrows it below what sampleWindow configured.
    const low = Number.isFinite(window) ? Math.max(0, Math.floor(target - window)) : 0;
    const high = Number.isFinite(window) ? Math.min(100, Math.ceil(target + window)) : 100;

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT p.id, p.popularity
      FROM "Puzzle" p
      JOIN "PuzzleAsset" a
        ON a."puzzleId" = p.id
       AND a.kind = 'AUDIO_CLIP'::"AssetKind"
      WHERE p."gameId" = ${args.gameId}
        AND p."isActive" = true
        AND p."isBlocked" = false
        AND p.popularity BETWEEN ${low} AND ${high}
        AND coalesce(array_length(a."stageByteOffsets", 1), 0) >= ${args.maxAttempts}
        AND p.id <> ALL(${args.excludePuzzleIds}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM "PlayerPuzzleHistory" h
          WHERE h."playerId" = ${args.playerId}
            AND h."puzzleId" = p.id
            AND h."lastSeenAt" > ${cooldownCutoff}
        )
      ORDER BY random()
      LIMIT 1
    `;

    const row = rows[0];
    if (row) {
      if (multiplier !== 1) {
        // Not an error, but it IS the signal that the catalog is too thin at this
        // percentile. Worth seeing in logs before players notice repeats.
        const widening = Number.isFinite(multiplier)
          ? `${multiplier}x window`
          : "the whole catalog";
        console.warn(
          `[selection] fell back to ${widening} for round ${args.roundIndex} ` +
            `(target ${target}, game ${args.gameId}) — catalog is thin at this percentile`,
        );
      }
      return {
        puzzleId: row.id,
        popularity: row.popularity,
        targetPopularity: Math.round(target),
      };
    }
  }

  return null;
}

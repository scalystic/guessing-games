import "server-only";
import { prisma } from "@/lib/db";
import { decadeClause, type DecadeFilter } from "@/lib/game/decade-filter";

export type { DecadeFilter };

export type SelectionCurve = {
  startPopularity: number;
  rampPerRound: number;
  minPopularity: number;
  sampleWindow: number;
};

export function targetPopularity(curve: SelectionCurve, roundIndex: number): number {
  const raw = curve.startPopularity - curve.rampPerRound * (roundIndex - 1);
  return Math.min(100, Math.max(curve.minPopularity, raw));
}

const WINDOW_MULTIPLIERS = [1, 2, 4, Number.POSITIVE_INFINITY];

export type SampleArgs = {
  gameId: string;
  playerId: string;
  roundIndex: number;
  curve: SelectionCurve;
  /// YOUTUBE-ONLY: no longer read. It gated the stored-clip playability test
  /// (`array_length(stageByteOffsets, 1) >= maxAttempts`), which is retired.
  /// Kept on the args so callers and the restore path stay unchanged.
  maxAttempts: number;
  cooldownDays: number;
  excludePuzzleIds: string[];
  decadeFilter?: DecadeFilter | null;
};

export type SampledPuzzle = {
  puzzleId: string;
  popularity: number;
  targetPopularity: number;
  /// Always set — a puzzle without a YouTube id is not playable and is never
  /// sampled. See the YOUTUBE-ONLY note on samplePuzzle().
  youtubeVideoId: string;
  /// Millisecond offset into the YouTube video where the hook starts.
  hookStartMs: number;

  // YOUTUBE-ONLY (R2 stored clips retired): the sampler used to also return the
  // AUDIO_CLIP asset that GET /api/runs/[runId]/audio sliced stage prefixes out
  // of. Nothing reads it now, so it is no longer selected or returned.
  //
  // asset: {
  //   storageKey: string;
  //   stageByteOffsets: number[];
  //   byteSize: number | null;
  //   ladderRevision: number;
  // } | null;
};

type Row = {
  id: string;
  popularity: number;
  external_id: string;
  hook_start_ms: number;

  // YOUTUBE-ONLY: asset columns, no longer selected.
  //
  // storageKey: string | null;
  // stageByteOffsets: number[] | null;
  // byteSize: number | null;
  // ladderRevision: number | null;
};

type RawExecutor = Pick<typeof prisma, "$queryRaw">;

/// Pick a puzzle for a round.
///
/// YOUTUBE-ONLY: playability used to be
///
///   (a."storageKey" IS NOT NULL
///    AND coalesce(array_length(a."stageByteOffsets", 1), 0) >= maxAttempts)
///   OR (s."externalId" IS NOT NULL AND a."storageKey" IS NULL)
///
/// — a stored AUDIO_CLIP with enough stage offsets, OR a YouTube id. Stored clips
/// are retired, so it now means exactly one thing: `s."externalId" IS NOT NULL`.
/// A puzzle whose only audio was an R2 clip is therefore invisible to the sampler
/// rather than selected and then silent.
///
/// Note what this drops with it: `maxAttempts` no longer constrains selection at
/// all. The stage ladder for a YouTube round is a play-window the client applies
/// to the stream, not a set of byte offsets that has to exist up front.
export async function samplePuzzle(
  args: SampleArgs,
  db: RawExecutor = prisma,
): Promise<SampledPuzzle | null> {
  const target = targetPopularity(args.curve, args.roundIndex);
  const cooldownCutoff = new Date(Date.now() - args.cooldownDays * 24 * 60 * 60 * 1000);

  for (const multiplier of WINDOW_MULTIPLIERS) {
    const window = args.curve.sampleWindow * multiplier;
    const low = Number.isFinite(window) ? Math.max(0, Math.floor(target - window)) : 0;
    const high = Number.isFinite(window) ? Math.min(100, Math.ceil(target + window)) : 100;

    const rows = await db.$queryRaw<Row[]>`
      SELECT
        p.id,
        p.popularity,
        s."externalId"       AS external_id,
        COALESCE(s."hookStartMs", 0) AS hook_start_ms
      FROM "Puzzle" p
      -- INNER JOIN, not LEFT: no song row means no YouTube id means not playable.
      JOIN "Song" s
        ON s."puzzleId" = p.id
      -- YOUTUBE-ONLY: the AUDIO_CLIP join and the stored-clip half of the
      -- playability test are retired.
      --
      -- LEFT JOIN "PuzzleAsset" a
      --   ON a."puzzleId" = p.id
      --  AND a.kind = 'AUDIO_CLIP'::"AssetKind"
      WHERE p."gameId" = ${args.gameId}
        AND p."isActive" = true
        AND p."isBlocked" = false
        AND p.popularity BETWEEN ${low} AND ${high}
        -- Playable = streams from YouTube. That is the only source now.
        --
        -- The retired stored-clip test is NOT reproduced here, not even inside a
        -- -- comment. A template interpolation in a SQL comment is still a bound
        -- parameter that Postgres never references, and the statement fails with
        -- "could not determine data type of parameter $N". That applies to any
        -- attempt to WRITE an interpolation here too, escaped or not. The old
        -- predicate is spelled out in the doc comment on samplePuzzle() instead.
        AND s."externalId" IS NOT NULL
        AND p.id <> ALL(${args.excludePuzzleIds}::text[])
        ${decadeClause(args.decadeFilter)}
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
        // Non-null by the WHERE clause above.
        youtubeVideoId: row.external_id,
        hookStartMs: row.hook_start_ms,
      };
    }
  }

  return null;
}

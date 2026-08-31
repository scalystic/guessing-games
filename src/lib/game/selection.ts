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
  maxAttempts: number;
  cooldownDays: number;
  excludePuzzleIds: string[];
  decadeFilter?: DecadeFilter | null;
};

export type SampledPuzzle = {
  puzzleId: string;
  popularity: number;
  targetPopularity: number;
  /// Null for YouTube-streamed songs (no stored clip). Non-null for stored songs.
  asset: {
    storageKey: string;
    stageByteOffsets: number[];
    byteSize: number | null;
    ladderRevision: number;
  } | null;
  /// Set for YouTube-streamed songs. Null for stored songs.
  youtubeVideoId: string | null;
  /// Millisecond offset into the YouTube video where the hook starts.
  hookStartMs: number;
};

type Row = {
  id: string;
  popularity: number;
  storageKey: string | null;
  stageByteOffsets: number[] | null;
  byteSize: number | null;
  ladderRevision: number | null;
  external_id: string | null;
  hook_start_ms: number;
};

type RawExecutor = Pick<typeof prisma, "$queryRaw">;

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
        a."storageKey"       AS "storageKey",
        a."stageByteOffsets" AS "stageByteOffsets",
        a."byteSize"         AS "byteSize",
        a."ladderRevision"   AS "ladderRevision",
        s."externalId"       AS external_id,
        COALESCE(s."hookStartMs", 0) AS hook_start_ms
      FROM "Puzzle" p
      -- LEFT JOIN: YouTube songs have no AUDIO_CLIP asset
      LEFT JOIN "PuzzleAsset" a
        ON a."puzzleId" = p.id
       AND a.kind = 'AUDIO_CLIP'::"AssetKind"
      LEFT JOIN "Song" s
        ON s."puzzleId" = p.id
      WHERE p."gameId" = ${args.gameId}
        AND p."isActive" = true
        AND p."isBlocked" = false
        AND p.popularity BETWEEN ${low} AND ${high}
        -- Playable = has stored audio with enough stages, OR is a YouTube song
        AND (
          (a."storageKey" IS NOT NULL AND coalesce(array_length(a."stageByteOffsets", 1), 0) >= ${args.maxAttempts})
          OR (s."externalId" IS NOT NULL AND a."storageKey" IS NULL)
        )
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
        asset: row.storageKey
          ? {
              storageKey: row.storageKey,
              stageByteOffsets: row.stageByteOffsets ?? [],
              byteSize: row.byteSize,
              ladderRevision: row.ladderRevision ?? 1,
            }
          : null,
        youtubeVideoId: row.external_id ?? null,
        hookStartMs: row.hook_start_ms,
      };
    }
  }

  return null;
}

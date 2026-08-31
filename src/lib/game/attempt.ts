import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { samplePuzzle, type DecadeFilter } from "@/lib/game/selection";
import { scoreSolvedRound, solveExtendsStreak } from "@/lib/game/scoring/v1";
import { deriveHint, type RoundHint } from "@/lib/game/hint";
import { runTokenMatches } from "@/lib/game/run-token";
import { readClipPrefix } from "@/lib/storage";

/// One attempt — a guess or a skip. Both advance the ladder, so they share every
/// line of this except whether a correct answer is even possible.
///
/// The whole thing runs in one transaction over a row-locked Run. Two
/// simultaneous submits must not both advance the stage, and the guard is
/// layered: SELECT ... FOR UPDATE, then Run.version, then the
/// @@unique([roundId, attemptIndex]) backstop if a caller omits an idempotency
/// key. See docs/game-engine.md § Server authority.
///
/// ---------------------------------------------------------------------------
/// Why this file is written in SQL rather than Prisma calls
/// ---------------------------------------------------------------------------
///
/// A transaction runs on ONE connection, and node-postgres queues statements on
/// a connection rather than pipelining them. So every `await tx.something()` is
/// a full network round trip, and they are strictly serial — `Promise.all` over
/// them buys nothing (measured: 5 queries cost the same either way).
///
/// Against a managed Postgres in another region a round trip is ~100ms, and the
/// typed version of this function made 13 of them for a plain wrong guess and 17
/// for one that resolved a round. That is 1.3-1.8s of pure waiting per attempt,
/// which is most of what made the game feel like a loading screen.
///
/// The fix is to stop counting queries and start counting ROUND TRIPS. Postgres
/// data-modifying CTEs let several writes plus their follow-up reads travel as a
/// single statement, so the paths below cost:
///
///   ladder advances : BEGIN, lock+read, one write CTE, COMMIT          = 4
///   round resolves  : BEGIN, lock+read, resolve CTE, sample, advance CTE, COMMIT = 6
///
/// Each CTE branch is gated on `EXISTS (SELECT 1 FROM ins)`, which is both the
/// data dependency that forces the guess insert to be evaluated first and the
/// mechanism that makes a replayed idempotency key a genuine no-op: if the
/// INSERT conflicts, every dependent UPDATE matches zero rows.
///
/// Ids for inserted rows are generated here because raw SQL bypasses Prisma's
/// `@default(cuid())`. Nothing parses a Guess or RunRound id — they are opaque
/// keys — so a uuid is as good as a cuid and needs no migration.

export type AttemptInput = {
  runId: string;
  /// Raw run token from the Authorization header. Verified against
  /// Run.tokenHash inside the locking read, so proving ownership costs no
  /// round trip of its own.
  runToken: string;
  idempotencyKey: string;
  /// Typeahead selection. Null for a skip.
  guessedPuzzleId: string | null;
  /// Kept only for tuning aliases — never used to decide correctness.
  rawInput: string | null;
  isSkip: boolean;
};

export type GiveUpInput = {
  runId: string;
  runToken: string;
  /// One key per remaining attempt slot, so a retried give-up is still a no-op.
  /// The client sends a base key and we derive the rest — see the route.
  idempotencyKeyPrefix: string;
};

export type AchievementEntry = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  unlocked: boolean;
  color: string;
};

/// Audio the player has just become entitled to, delivered WITH the attempt
/// response instead of behind another request.
///
/// This is the second half of the latency fix. The client used to await the
/// attempt, then await GET /audio — two more DB reads plus an R2 fetch, strictly
/// after the first call returned. Since the transaction already knows which
/// stage was unlocked and which object holds it, the bytes can ride along.
///
/// It leaks nothing new: `nextAudioUrl` already pointed at exactly these bytes,
/// and the round it belongs to was already open server-side by the time the
/// response was written.
export type InlineAudio = {
  /// base64 of the earned prefix. Small by construction — a stage slice is a few
  /// KB to ~40 KB, so base64's 33% overhead is far cheaper than a round trip.
  bytes: string;
  /// The stage these bytes represent, authoritative as ever.
  stage: number;
  byteSize: number;
};

export type AttemptResult = {
  outcome: "PENDING" | "SOLVED" | "FAILED";
  stageReached: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  /// Null once the round resolves — there is no more audio to earn.
  nextAudioUrl: string | null;
  /// The bytes `nextAudioUrl` would have returned. Null when there is no next
  /// stage, or when the asset is unservable — in which case the client falls
  /// back to the route, which reports the failure properly.
  nextAudio: InlineAudio | null;
  /// YouTube video ID for the round currently in play (PENDING) or the next
  /// round (SOLVED/FAILED). Null for stored-audio songs.
  youtubeVideoId: string | null;
  /// Millisecond offset in the YouTube video where the hook starts.
  hookStartMs: number;
  livesRemaining: number;
  runStatus: "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "EXPIRED";
  roundIndex: number;
  /// Run totals AFTER this attempt. Reported rather than left to the client to
  /// re-derive: the streak rule lives in scoring/v1.ts, and a second copy of it
  /// in the hook is a copy that drifts.
  currentStreak: number;
  bestStreak: number;
  /// Null while PENDING.
  points: number | null;
  /// Revealed only once the round resolves.
  reveal: {
    title: string;
    artist: string;
    album: string | null;
    releaseYear: number | null;
  } | null;
  /// Clue about the CURRENT round, earned by attempts already spent. Null until
  /// the second attempt, and null again once the round resolves — at that point
  /// `reveal` supersedes it. Derived server-side because the client never holds
  /// the target.
  hint: RoundHint | null;

  // Authoritative reward/level/achievements info from backend
  score: number;
  level: number;
  xpProgress: number;
  xpPerLevel: number;
  rankName: string;
  achievements: AchievementEntry[];
};

export type AttemptError =
  | { kind: "not_found" }
  | { kind: "not_in_progress"; status: string }
  | { kind: "no_current_round" }
  | { kind: "already_resolved" };

export class AttemptFailure extends Error {
  constructor(public readonly detail: AttemptError) {
    super(detail.kind);
  }
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export type Rewards = {
  score: number;
  level: number;
  xpProgress: number;
  xpPerLevel: number;
  rankName: string;
  achievements: AchievementEntry[];
};

/// Pure. This used to run `runRound.findMany` on EVERY attempt — a whole round
/// trip spent re-deriving two numbers the Run row already carries. `roundsSolved`
/// is a Run column, and "has a 1-attempt solve" is one EXISTS subquery folded
/// into the locking read, so both arrive for free now.
export function computeRewards(args: {
  score: number;
  bestStreak: number;
  roundsSolved: number;
  hasPerfectSync: boolean;
}): Rewards {
  const { score, bestStreak, roundsSolved, hasPerfectSync } = args;

  let level = 1;
  let remainingScore = score;
  while (remainingScore >= (level + 1) * 500) {
    remainingScore -= (level + 1) * 500;
    level++;
  }
  const xpProgress = remainingScore;
  const xpPerLevel = (level + 1) * 500;

  let rankName = "Novice Listener";
  if (level >= 81) {
    rankName = "Midnight Legend";
  } else if (level >= 51) {
    rankName = "Soundwave Maestro";
  } else if (level >= 31) {
    rankName = "Frequency Expert";
  } else if (level >= 16) {
    rankName = "Melody Scout";
  } else if (level >= 6) {
    rankName = "Signal Catcher";
  }

  const achievements = [
    {
      id: "first_win",
      name: "First Lock",
      desc: "Identify your first track",
      icon: "🏆",
      unlocked: roundsSolved > 0,
      color: "from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/30",
    },
    {
      id: "perfect_sync",
      name: "Perfect Sync",
      desc: "Identify in exactly 1 attempt",
      icon: "⚡",
      unlocked: hasPerfectSync,
      color: "from-sky-500/20 to-blue-500/5 text-sky-500 border-sky-500/30",
    },
    {
      id: "streak_master",
      name: "Maestro",
      desc: "Reach a streak of 10 wins",
      icon: "🔥",
      unlocked: bestStreak >= 10,
      color: "from-orange-500/20 to-red-500/5 text-orange-500 border-orange-500/30",
    },
    {
      id: "century_score",
      name: "Audiophile",
      desc: "Reach a score of 1,000",
      icon: "👑",
      unlocked: score >= 1000,
      color: "from-purple-500/20 to-indigo-500/5 text-purple-500 border-purple-500/30",
    },
  ];

  return { score, level, xpProgress, xpPerLevel, rankName, achievements };
}

// ---------------------------------------------------------------------------
// Audio assets
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/// Everything needed to slice a stage out of a stored clip, as read alongside
/// the rows that decided which stage was earned.
export type AssetRow = {
  storageKey: string | null;
  stageByteOffsets: number[] | null;
  byteSize: number | null;
  ladderRevision: number | null;
};

/// A pending fetch: which object, and how many bytes of it the player has paid
/// for. Resolved AFTER the transaction commits — holding a row lock open across
/// an R2 round trip would serialize every concurrent attempt behind object
/// storage, which is the opposite of the point.
type PendingAudio = { asset: AssetRow; stage: number };

function pendingAudio(asset: AssetRow, stage: number): PendingAudio | null {
  return asset.storageKey ? { asset, stage } : null;
}

/// Resolve inlined audio, degrading to null rather than failing the attempt.
///
/// Every reason this can return null — missing asset, stale ladder revision, a
/// stage past the end of the offsets, R2 unreachable — is a reason GET /audio
/// would return a 5xx with a precise message. Reproducing that reasoning here
/// would be a second copy of it, so the fast path simply declines and the client
/// falls back to the route it already knows how to call.
export async function inlineAudioFor(
  asset: AssetRow | null,
  stage: number,
  gameLadderRevision: number,
): Promise<InlineAudio | null> {
  if (!asset || !asset.storageKey || !asset.stageByteOffsets) return null;
  if (asset.ladderRevision !== gameLadderRevision) return null;

  const endExclusive = asset.stageByteOffsets[stage - 1];
  if (endExclusive === undefined || endExclusive <= 0) return null;

  try {
    const bytes = await readClipPrefix(asset.storageKey, endExclusive, asset.byteSize);
    return {
      bytes: Buffer.from(bytes).toString("base64"),
      stage,
      byteSize: bytes.length,
    };
  } catch (error) {
    console.warn(
      `[attempt] inline audio declined for ${asset.storageKey} stage ${stage}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function resolveAudio(
  pending: PendingAudio | null,
  gameLadderRevision: number,
): Promise<InlineAudio | null> {
  if (!pending) return Promise.resolve(null);
  return inlineAudioFor(pending.asset, pending.stage, gameLadderRevision);
}

// ---------------------------------------------------------------------------
// Locking read
// ---------------------------------------------------------------------------

type LockedRow = {
  token_hash: string;
  status: string;
  mode: string;
  current_round_index: number;
  lives_remaining: number;
  max_rounds: number | null;
  current_streak: number;
  best_streak: number;
  score: number;
  rounds_solved: number;
  player_id: string;
  game_id: string;
  multiplayer_room_id: string | null;
  daily_challenge_id: string | null;
  max_attempts: number;
  reveal_ladder: unknown;
  ladder_revision: number;
  puzzle_cooldown_days: number;
  start_popularity: number;
  ramp_per_round: number;
  min_popularity: number;
  sample_window: number;
  has_perfect_sync: boolean;
  decade_filter: string | null;
  round_id: string | null;
  round_index: number | null;
  round_puzzle_id: string | null;
  round_outcome: string | null;
  stage_reached: number | null;
  attempts_used: number | null;
} & AssetRow;

/// The one read every path starts from: lock the Run, and pull the run, its
/// game's config, the current round, that round's audio asset, the hint source
/// and the perfect-sync flag in the same statement.
///
/// `FOR UPDATE OF r` rather than a bare `FOR UPDATE`: RunRound is the nullable
/// side of a LEFT JOIN here and Postgres refuses to lock that, and Game has no
/// business being locked by a gameplay attempt anyway.
async function lockAndRead(tx: Tx, runId: string): Promise<LockedRow> {
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT
      r."tokenHash"           AS token_hash,
      r.status::text          AS status,
      r.mode::text            AS mode,
      r."currentRoundIndex"   AS current_round_index,
      r."livesRemaining"      AS lives_remaining,
      r."maxRounds"           AS max_rounds,
      r."currentStreak"       AS current_streak,
      r."bestStreak"          AS best_streak,
      r.score                 AS score,
      r."roundsSolved"        AS rounds_solved,
      r."playerId"            AS player_id,
      r."gameId"              AS game_id,
      r."multiplayerRoomId"   AS multiplayer_room_id,
      r."dailyChallengeId"    AS daily_challenge_id,
      g."maxAttempts"         AS max_attempts,
      g."revealLadder"        AS reveal_ladder,
      g."ladderRevision"      AS ladder_revision,
      g."puzzleCooldownDays"  AS puzzle_cooldown_days,
      g."startPopularity"     AS start_popularity,
      g."rampPerRound"        AS ramp_per_round,
      g."minPopularity"       AS min_popularity,
      g."sampleWindow"        AS sample_window,
      r."decadeFilter"::text  AS decade_filter,
      EXISTS (
        SELECT 1 FROM "RunRound" p
        WHERE p."runId" = r.id AND p.outcome = 'SOLVED' AND p."attemptsUsed" = 1
      )                       AS has_perfect_sync,
      rr.id                   AS round_id,
      rr."roundIndex"         AS round_index,
      rr."puzzleId"           AS round_puzzle_id,
      rr.outcome::text        AS round_outcome,
      rr."stageReached"       AS stage_reached,
      rr."attemptsUsed"       AS attempts_used,
      a."storageKey"          AS "storageKey",
      a."stageByteOffsets"    AS "stageByteOffsets",
      a."byteSize"            AS "byteSize",
      a."ladderRevision"      AS "ladderRevision"
    FROM "Run" r
    JOIN "Game" g
      ON g.id = r."gameId"
    LEFT JOIN "RunRound" rr
      ON rr."runId" = r.id AND rr."roundIndex" = r."currentRoundIndex"
    LEFT JOIN "PuzzleAsset" a
      ON a."puzzleId" = rr."puzzleId" AND a.kind = 'AUDIO_CLIP'::"AssetKind"
    WHERE r.id = ${runId}
    FOR UPDATE OF r
  `;

  const row = rows[0];
  if (!row) throw new AttemptFailure({ kind: "not_found" });
  return row;
}

/// Same response for "no such run" and "wrong token": distinguishing them tells
/// a caller which run ids are real.
function assertToken(row: LockedRow, token: string): void {
  if (!runTokenMatches(token, row.token_hash)) {
    throw new AttemptFailure({ kind: "not_found" });
  }
}

/// Game.revealLadder is Json, so it arrives as whatever was stored.
function ladderOf(row: LockedRow): number[] {
  const raw = row.reveal_ladder;
  if (Array.isArray(raw)) return raw.filter((n): n is number => typeof n === "number");
  return [];
}

type RunFacts = {
  id: string;
  playerId: string;
  gameId: string;
  mode: RunMode;
  multiplayerRoomId: string | null;
  dailyChallengeId: string | null;
  livesRemaining: number;
  maxRounds: number | null;
  currentStreak: number;
  bestStreak: number;
  score: number;
  roundsSolved: number;
  hasPerfectSync: boolean;
  decadeFilter: DecadeFilter | null;
  ladderRevision: number;
  maxAttempts: number;
  ladder: number[];
  curve: {
    puzzleCooldownDays: number;
    startPopularity: number;
    rampPerRound: number;
    minPopularity: number;
    sampleWindow: number;
  };
};

type RoundFacts = {
  id: string;
  roundIndex: number;
  puzzleId: string;
  stageReached: number;
  attemptsUsed: number;
  asset: AssetRow;
};

/// Validate the locked row into the shape the rest of the file works with, and
/// raise the same failures the typed version did.
function facts(row: LockedRow, runId: string): { run: RunFacts; round: RoundFacts } {
  if (row.status !== "IN_PROGRESS") {
    throw new AttemptFailure({ kind: "not_in_progress", status: row.status });
  }
  if (
    row.round_id === null ||
    row.round_index === null ||
    row.round_puzzle_id === null ||
    row.stage_reached === null ||
    row.attempts_used === null
  ) {
    throw new AttemptFailure({ kind: "no_current_round" });
  }
  if (row.round_outcome !== "PENDING") {
    throw new AttemptFailure({ kind: "already_resolved" });
  }

  return {
    run: {
      id: runId,
      playerId: row.player_id,
      gameId: row.game_id,
      mode: row.mode as RunMode,
      multiplayerRoomId: row.multiplayer_room_id,
      dailyChallengeId: row.daily_challenge_id,
      livesRemaining: row.lives_remaining,
      maxRounds: row.max_rounds,
      currentStreak: row.current_streak,
      bestStreak: row.best_streak,
      score: row.score,
      roundsSolved: row.rounds_solved,
      hasPerfectSync: row.has_perfect_sync,
      decadeFilter: row.decade_filter as DecadeFilter | null,
      ladderRevision: row.ladder_revision,
      maxAttempts: row.max_attempts,
      ladder: ladderOf(row),
      curve: {
        puzzleCooldownDays: row.puzzle_cooldown_days,
        startPopularity: row.start_popularity,
        rampPerRound: row.ramp_per_round,
        minPopularity: row.min_popularity,
        sampleWindow: row.sample_window,
      },
    },
    round: {
      id: row.round_id,
      roundIndex: row.round_index,
      puzzleId: row.round_puzzle_id,
      stageReached: row.stage_reached,
      attemptsUsed: row.attempts_used,
      asset: {
        storageKey: row.storageKey,
        stageByteOffsets: row.stageByteOffsets,
        byteSize: row.byteSize,
        ladderRevision: row.ladderRevision,
      },
    },
  };
}

type RunMode = "DAILY" | "PRACTICE" | "ENDLESS" | "MULTIPLAYER";

/// Whether running out of lives ends the run.
///
/// Only DAILY, where a bounded attempt IS the format. PRACTICE, ENDLESS, and
/// MULTIPLAYER are open-ended (or bounded by room rounds), so a life loss never
/// terminates early; the socket handler controls the overall room lifecycle.
function livesEndTheRun(mode: RunMode): boolean {
  return mode === "DAILY";
}

// ---------------------------------------------------------------------------
// Attempt
// ---------------------------------------------------------------------------

export async function applyAttempt(input: AttemptInput): Promise<AttemptResult> {
  const { result, audio, ladderRevision } = await prisma.$transaction(async (tx) => {
    const row = await lockAndRead(tx, input.runId);
    assertToken(row, input.runToken);
    const { run, round } = facts(row, input.runId);

    const attemptIndex = round.attemptsUsed + 1;
    const isCorrect =
      !input.isSkip && input.guessedPuzzleId !== null && input.guessedPuzzleId === round.puzzleId;

    // Audio the player has now heard, for the leaderboard tie-break.
    const revealMs = run.ladder[round.stageReached - 1] ?? 0;

    if (isCorrect) {
      return resolveAndAdvance(tx, { run, round, attemptIndex, revealMs, input, solved: true });
    }

    // A correct guess on the last attempt still solves; a wrong one there fails.
    if (attemptIndex >= run.maxAttempts) {
      return resolveAndAdvance(tx, { run, round, attemptIndex, revealMs, input, solved: false });
    }

    return advanceLadder(tx, { run, round, attemptIndex, revealMs, input });
  });

  return { ...result, nextAudio: await resolveAudio(audio, ladderRevision) };
}

type TxResult = {
  result: Omit<AttemptResult, "nextAudio">;
  audio: PendingAudio | null;
  ladderRevision: number;
};

/// Still PENDING — spend the attempt, advance the ladder, hand over the next
/// slice. One statement: insert the guess, bump the round, bump the run, and read
/// back the hint source.
async function advanceLadder(
  tx: Tx,
  args: {
    run: RunFacts;
    round: RoundFacts;
    attemptIndex: number;
    revealMs: number;
    input: AttemptInput;
  },
): Promise<TxResult> {
  const { run, round, attemptIndex, revealMs, input } = args;

  type Row = {
    inserted: number;
    stage_reached: number | null;
    attempts_used: number | null;
    title: string | null;
    release_year: number | null;
    decade: number | null;
    genres: string[] | null;
    external_id: string | null;
    hook_start_ms: number;
  };

  const rows = await tx.$queryRaw<Row[]>`
    WITH ins AS (
      INSERT INTO "Guess" (
        id, "roundId", "attemptIndex", "stageAtGuess",
        "guessedPuzzleId", "rawInput", "isCorrect", "isSkip",
        "idempotencyKey", "createdAt"
      )
      VALUES (
        ${randomUUID()}, ${round.id}, ${attemptIndex}, ${round.stageReached},
        ${input.guessedPuzzleId}, ${input.rawInput}, false, ${input.isSkip},
        ${input.idempotencyKey}, now()
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    ),
    rr AS (
      UPDATE "RunRound"
      SET "attemptsUsed" = ${attemptIndex}, "stageReached" = "stageReached" + 1
      WHERE id = ${round.id} AND EXISTS (SELECT 1 FROM ins)
      RETURNING "stageReached", "attemptsUsed"
    ),
    ru AS (
      UPDATE "Run"
      SET version = version + 1, "totalRevealMs" = "totalRevealMs" + ${revealMs}
      WHERE id = ${run.id} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    )
    SELECT
      (SELECT count(*) FROM ins)::int      AS inserted,
      (SELECT "stageReached" FROM rr)      AS stage_reached,
      (SELECT "attemptsUsed" FROM rr)      AS attempts_used,
      s.title                              AS title,
      s."releaseYear"                      AS release_year,
      s.decade                             AS decade,
      s.genres                             AS genres,
      s."externalId"                       AS external_id,
      COALESCE(s."hookStartMs", 0)         AS hook_start_ms
    FROM (SELECT 1) d
    LEFT JOIN "Song" s ON s."puzzleId" = ${round.puzzleId}
  `;

  const row = rows[0];
  if (!row || row.inserted === 0) return replay(tx, run.id);

  const stageReached = row.stage_reached ?? round.stageReached + 1;
  const attemptsUsed = row.attempts_used ?? attemptIndex;

  const hint =
    row.title !== null
      ? deriveHint(
          {
            title: row.title,
            releaseYear: row.release_year,
            decade: row.decade,
            genres: row.genres ?? [],
          },
          attemptsUsed,
        )
      : null;

  return {
    ladderRevision: run.ladderRevision,
    audio: pendingAudio(round.asset, stageReached),
    result: {
      outcome: "PENDING",
      stageReached,
      attemptsUsed,
      attemptsRemaining: run.maxAttempts - attemptsUsed,
      nextAudioUrl: `/api/runs/${run.id}/audio`,
      youtubeVideoId: row.external_id ?? null,
      hookStartMs: row.hook_start_ms,
      livesRemaining: run.livesRemaining,
      runStatus: "IN_PROGRESS",
      roundIndex: round.roundIndex,
      currentStreak: run.currentStreak,
      bestStreak: run.bestStreak,
      points: null,
      reveal: null,
      hint,
      ...computeRewards({
        score: run.score,
        bestStreak: run.bestStreak,
        roundsSolved: run.roundsSolved,
        hasPerfectSync: run.hasPerfectSync,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/// Resolve the round and open the next one (or finish the run).
///
/// Two statements rather than the seven the typed version used: one CTE banks
/// the round, records history, bumps the puzzle counters and reads back both the
/// reveal and the run's used-puzzle list; then, after selection picks a puzzle, a
/// second CTE opens the next round and updates the run.
async function resolveAndAdvance(
  tx: Tx,
  args: {
    run: RunFacts;
    round: RoundFacts;
    attemptIndex: number;
    revealMs: number;
    input: AttemptInput;
    solved: boolean;
    /// Give-up spends several slots at once.
    extraGuesses?: { id: string; attemptIndex: number; stage: number; key: string }[];
    /// Give-up crosses several rungs, so it cannot use one ladder entry.
    totalRevealMs?: number;
    /// Where the ladder ended up. Defaults to the round's current stage.
    finalStage?: number;
  },
): Promise<TxResult> {
  const { run, round, attemptIndex, input, solved } = args;
  const revealMs = args.totalRevealMs ?? args.revealMs;
  const finalStage = args.finalStage ?? round.stageReached;

  const { points, xp } = solved
    ? scoreSolvedRound({
        stageReached: round.stageReached,
        roundIndex: round.roundIndex,
        currentStreak: run.currentStreak,
        attemptsUsed: attemptIndex,
        maxAttempts: run.maxAttempts,
      })
    : { points: 0, xp: 0 };

  const outcome = solved ? "SOLVED" : "FAILED";

  // Solved within the first 3 stages — the signal that drives retuning.
  const earlyInc = solved && round.stageReached <= 3 ? 1 : 0;
  const solveInc = solved ? 1 : 0;

  type Row = {
    inserted: number;
    title: string | null;
    artist: string | null;
    album: string | null;
    release_year: number | null;
  };

  // Give-up inserts one row per remaining slot; an ordinary attempt inserts one.
  const guessRows = args.extraGuesses ?? [
    {
      id: randomUUID(),
      attemptIndex,
      stage: round.stageReached,
      key: input.idempotencyKey,
    },
  ];

  const rows = await tx.$queryRaw<Row[]>`
    WITH ins AS (
      INSERT INTO "Guess" (
        id, "roundId", "attemptIndex", "stageAtGuess",
        "guessedPuzzleId", "rawInput", "isCorrect", "isSkip",
        "idempotencyKey", "createdAt"
      )
      SELECT
        t.id, ${round.id}, t.idx, t.stage,
        -- Stored whether or not the guess was right. A wrong FINAL guess is
        -- still what the player named: the run-state route reads it back to
        -- label that attempt, and rawInput is the alias-tuning signal. Give-up
        -- passes null for both, so no branch is needed here.
        ${input.guessedPuzzleId}, ${input.rawInput},
        ${solved}, ${input.isSkip},
        t.key, now()
      FROM unnest(
        ${guessRows.map((g) => g.id)}::text[],
        ${guessRows.map((g) => g.attemptIndex)}::int[],
        ${guessRows.map((g) => g.stage)}::int[],
        ${guessRows.map((g) => g.key)}::text[]
      ) AS t(id, idx, stage, key)
      ON CONFLICT DO NOTHING
      RETURNING id
    ),
    rr AS (
      UPDATE "RunRound"
      SET outcome = ${outcome}::"RoundOutcome",
          "attemptsUsed" = ${attemptIndex},
          "stageReached" = ${finalStage},
          points = ${points},
          xp = ${xp},
          "resolvedAt" = now()
      WHERE id = ${round.id} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    ),
    hist AS (
      INSERT INTO "PlayerPuzzleHistory" ("playerId", "puzzleId", "seenCount", "lastOutcome", "lastSeenAt")
      SELECT ${run.playerId}, ${round.puzzleId}, 1, ${outcome}::"RoundOutcome", now()
      WHERE EXISTS (SELECT 1 FROM ins)
      ON CONFLICT ("playerId", "puzzleId") DO UPDATE
        SET "seenCount"   = "PlayerPuzzleHistory"."seenCount" + 1,
            "lastOutcome" = EXCLUDED."lastOutcome",
            "lastSeenAt"  = now()
      RETURNING "playerId"
    ),
    pz AS (
      UPDATE "Puzzle"
      SET "playCount"       = "playCount" + 1,
          "solveCount"      = "solveCount" + ${solveInc},
          "earlySolveCount" = "earlySolveCount" + ${earlyInc}
      WHERE id = ${round.puzzleId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING id
    )
    SELECT
      (SELECT count(*) FROM ins)::int AS inserted,
      s.title         AS title,
      s.artist        AS artist,
      s.album         AS album,
      s."releaseYear" AS release_year
    FROM (SELECT 1) d
    LEFT JOIN "Song" s ON s."puzzleId" = ${round.puzzleId}
  `;

  const row = rows[0];
  if (!row || row.inserted === 0) return replay(tx, run.id);

  const reveal =
    row.title !== null && row.artist !== null
      ? {
          title: row.title,
          artist: row.artist,
          album: row.album,
          releaseYear: row.release_year,
        }
      : null;

  const nextStreak = solved ? (solveExtendsStreak() ? run.currentStreak + 1 : 0) : 0;
  const bestStreak = Math.max(run.bestStreak, nextStreak);
  // Floored rather than allowed to go negative: an open-ended run keeps playing
  // past zero, and a run of -4 lives is a number nothing can render.
  const livesRemaining = solved ? run.livesRemaining : Math.max(0, run.livesRemaining - 1);

  const outOfLives = livesEndTheRun(run.mode) && livesRemaining <= 0;
  const roundsExhausted = run.maxRounds !== null && round.roundIndex >= run.maxRounds;

  const finish = (): TxResult => ({
    ladderRevision: run.ladderRevision,
    audio: null,
    result: {
      outcome,
      stageReached: finalStage,
      attemptsUsed: attemptIndex,
      attemptsRemaining: 0,
      nextAudioUrl: null,
      youtubeVideoId: null,
      hookStartMs: 0,
      livesRemaining,
      runStatus: "COMPLETED",
      roundIndex: round.roundIndex,
      currentStreak: nextStreak,
      bestStreak,
      points,
      reveal,
      hint: null,
      ...computeRewards({
        score: run.score + points,
        bestStreak,
        roundsSolved: run.roundsSolved + solveInc,
        hasPerfectSync: run.hasPerfectSync || (solved && attemptIndex === 1),
      }),
    },
  });

  // Either terminal condition completes the run. A daily that runs out of lives
  // at round 7 still COMPLETES — it just scores less.
  if (outOfLives || roundsExhausted) {
    await completeRun(tx, { run, points, xp, revealMs, solved, livesRemaining, nextStreak, bestStreak });
    return finish();
  }

  const nextIndex = round.roundIndex + 1;

  type NextPick = {
    puzzleId: string;
    popularity: number;
    targetPopularity: number;
    youtubeVideoId?: string | null;
    hookStartMs?: number;
  };

  // For DAILY and MULTIPLAYER: use the pre-selected puzzle set; for all other modes: sample randomly.
  let pick: NextPick | null;

  if (run.mode === "DAILY" && run.dailyChallengeId) {
    const challengeRound = await tx.dailyChallengePuzzle.findUnique({
      where: { dailyChallengeId_roundIndex: { dailyChallengeId: run.dailyChallengeId, roundIndex: nextIndex } },
      select: {
        puzzleId: true,
        targetPopularity: true,
        puzzle: { select: { song: { select: { externalId: true, hookStartMs: true } } } },
      },
    });
    pick = challengeRound
      ? {
          puzzleId: challengeRound.puzzleId,
          popularity: 0,
          targetPopularity: challengeRound.targetPopularity ?? 0,
          youtubeVideoId: challengeRound.puzzle.song?.externalId ?? null,
          hookStartMs: challengeRound.puzzle.song?.hookStartMs ?? 0,
        }
      : null;
  } else if (run.mode === "MULTIPLAYER" && run.multiplayerRoomId) {
    const roomRound = await tx.multiplayerRound.findUnique({
      where: { roomId_roundIndex: { roomId: run.multiplayerRoomId, roundIndex: nextIndex } },
      select: { puzzleId: true },
    });
    pick = roomRound ? { puzzleId: roomRound.puzzleId, popularity: 0, targetPopularity: 0 } : null;
  } else {
    const used = await tx.runRound.findMany({
      where: { runId: run.id },
      select: { puzzleId: true },
    });
    pick = await samplePuzzle(
      {
        gameId: run.gameId,
        playerId: run.playerId,
        roundIndex: nextIndex,
        curve: run.curve,
        maxAttempts: run.maxAttempts,
        cooldownDays: run.curve.puzzleCooldownDays,
        excludePuzzleIds: used.map((r) => r.puzzleId),
        decadeFilter: run.decadeFilter,
      },
      tx,
    );
  }

  // Nothing left to play. Completing beats stranding the player mid-run with a
  // 500, and the score they earned still counts.
  if (!pick) {
    await completeRun(tx, { run, points, xp, revealMs, solved, livesRemaining, nextStreak, bestStreak });
    return finish();
  }

  type NextRow = { score: number | null } & AssetRow;

  const nextRows = await tx.$queryRaw<NextRow[]>`
    WITH nr AS (
      INSERT INTO "RunRound" (
        id, "runId", "roundIndex", "puzzleId",
        "targetPopularity", "puzzlePopularity", "startedAt"
      )
      VALUES (
        ${randomUUID()}, ${run.id}, ${nextIndex}, ${pick.puzzleId},
        ${pick.targetPopularity}, ${pick.popularity}, now()
      )
      RETURNING id
    ),
    ru AS (
      UPDATE "Run"
      SET "currentRoundIndex" = ${nextIndex},
          version             = version + 1,
          "livesRemaining"    = ${livesRemaining},
          "currentStreak"     = ${nextStreak},
          "bestStreak"        = ${bestStreak},
          score               = score + ${points},
          "xpEarned"          = "xpEarned" + ${xp},
          "roundsSolved"      = "roundsSolved" + ${solveInc},
          "roundsFailed"      = "roundsFailed" + ${solved ? 0 : 1},
          "totalRevealMs"     = "totalRevealMs" + ${revealMs}
      WHERE id = ${run.id} AND EXISTS (SELECT 1 FROM nr)
      RETURNING score
    )
    SELECT
      (SELECT score FROM ru) AS score,
      a."storageKey"         AS "storageKey",
      a."stageByteOffsets"   AS "stageByteOffsets",
      a."byteSize"           AS "byteSize",
      a."ladderRevision"     AS "ladderRevision"
    FROM (SELECT 1) d
    LEFT JOIN "PuzzleAsset" a
      ON a."puzzleId" = ${pick.puzzleId} AND a.kind = 'AUDIO_CLIP'::"AssetKind"
  `;

  const nextRow = nextRows[0];

  return {
    ladderRevision: run.ladderRevision,
    audio: nextRow ? pendingAudio(nextRow, 1) : null,
    result: {
      outcome,
      stageReached: finalStage,
      attemptsUsed: attemptIndex,
      attemptsRemaining: 0,
      nextAudioUrl: `/api/runs/${run.id}/audio`,
      // YouTube info for the NEXT round (pick came from samplePuzzle or room)
      youtubeVideoId: pick.youtubeVideoId ?? null,
      hookStartMs: pick.hookStartMs ?? 0,
      livesRemaining,
      runStatus: "IN_PROGRESS",
      roundIndex: round.roundIndex,
      currentStreak: nextStreak,
      bestStreak,
      points,
      reveal,
      hint: null,
      ...computeRewards({
        score: nextRow?.score ?? run.score + points,
        bestStreak,
        roundsSolved: run.roundsSolved + solveInc,
        hasPerfectSync: run.hasPerfectSync || (solved && attemptIndex === 1),
      }),
    },
  };
}

async function completeRun(
  tx: Tx,
  args: {
    run: RunFacts;
    points: number;
    xp: number;
    revealMs: number;
    solved: boolean;
    livesRemaining: number;
    nextStreak: number;
    bestStreak: number;
  },
): Promise<void> {
  const { run, points, xp, revealMs, solved, livesRemaining, nextStreak, bestStreak } = args;

  await tx.$executeRaw`
    UPDATE "Run"
    SET status            = 'COMPLETED'::"RunStatus",
        "endedAt"         = now(),
        version           = version + 1,
        "livesRemaining"  = ${Math.max(0, livesRemaining)},
        "currentStreak"   = ${nextStreak},
        "bestStreak"      = ${bestStreak},
        score             = score + ${points},
        "xpEarned"        = "xpEarned" + ${xp},
        "roundsSolved"    = "roundsSolved" + ${solved ? 1 : 0},
        "roundsFailed"    = "roundsFailed" + ${solved ? 0 : 1},
        "totalRevealMs"   = "totalRevealMs" + ${revealMs}
    WHERE id = ${run.id}
  `;
}

// ---------------------------------------------------------------------------
// Give up
// ---------------------------------------------------------------------------

/// Burn every remaining attempt on the current round, in ONE transaction.
///
/// The client used to do this by calling /skip in a loop until the round
/// resolved — up to six sequential round trips of six sequential transactions,
/// which is the slowest interaction the app had by a wide margin. It is one
/// resolution: the ladder ends where the last rung would have put it, the reveal
/// ms for every rung crossed is banked, and one life is lost, exactly as the
/// loop produced.
export async function applyGiveUp(input: GiveUpInput): Promise<AttemptResult> {
  const { result, audio, ladderRevision } = await prisma.$transaction(async (tx) => {
    const row = await lockAndRead(tx, input.runId);
    assertToken(row, input.runToken);
    const { run, round } = facts(row, input.runId);

    // Slots still unspent, and the rung each of them sits on.
    const slots: { id: string; attemptIndex: number; stage: number; key: string }[] = [];
    for (let index = round.attemptsUsed + 1; index <= run.maxAttempts; index++) {
      const stage = round.stageReached + (index - round.attemptsUsed - 1);
      slots.push({
        id: randomUUID(),
        attemptIndex: index,
        stage,
        // Derived per slot so the whole give-up is replay-safe under one key.
        key: `${input.idempotencyKeyPrefix}-g${index}`,
      });
    }

    if (slots.length === 0) throw new AttemptFailure({ kind: "already_resolved" });

    // Every rung the ladder walks past on the way down, matching what the loop
    // banked one skip at a time.
    const totalRevealMs = slots.reduce(
      (sum, slot) => sum + (run.ladder[slot.stage - 1] ?? 0),
      0,
    );
    const finalStage = slots[slots.length - 1]!.stage;

    return resolveAndAdvance(tx, {
      run,
      round,
      attemptIndex: run.maxAttempts,
      revealMs: 0,
      totalRevealMs,
      finalStage,
      extraGuesses: slots,
      solved: false,
      input: {
        runId: input.runId,
        runToken: input.runToken,
        idempotencyKey: slots[0]!.key,
        guessedPuzzleId: null,
        rawInput: null,
        isSkip: true,
      },
    });
  });

  return { ...result, nextAudio: await resolveAudio(audio, ladderRevision) };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/// Replay path for a duplicate idempotency key: report where the run is now
/// without touching anything. One round trip, where it used to be four.
async function replay(tx: Tx, runId: string): Promise<TxResult> {
  type Row = {
    status: string;
    current_round_index: number;
    lives_remaining: number;
    current_streak: number;
    best_streak: number;
    score: number;
    rounds_solved: number;
    max_attempts: number;
    ladder_revision: number;
    has_perfect_sync: boolean;
    round_outcome: string | null;
    stage_reached: number | null;
    attempts_used: number | null;
    round_index: number | null;
    points: number | null;
    title: string | null;
    artist: string | null;
    album: string | null;
    release_year: number | null;
    decade: number | null;
    genres: string[] | null;
    external_id: string | null;
    hook_start_ms: number;
  } & AssetRow;

  const rows = await tx.$queryRaw<Row[]>`
    SELECT
      r.status::text        AS status,
      r."currentRoundIndex" AS current_round_index,
      r."livesRemaining"    AS lives_remaining,
      r."currentStreak"     AS current_streak,
      r."bestStreak"        AS best_streak,
      r.score               AS score,
      r."roundsSolved"      AS rounds_solved,
      g."maxAttempts"       AS max_attempts,
      g."ladderRevision"    AS ladder_revision,
      EXISTS (
        SELECT 1 FROM "RunRound" p
        WHERE p."runId" = r.id AND p.outcome = 'SOLVED' AND p."attemptsUsed" = 1
      )                     AS has_perfect_sync,
      rr.outcome::text      AS round_outcome,
      rr."stageReached"     AS stage_reached,
      rr."attemptsUsed"     AS attempts_used,
      rr."roundIndex"       AS round_index,
      rr.points             AS points,
      s.title               AS title,
      s.artist              AS artist,
      s.album               AS album,
      s."releaseYear"       AS release_year,
      s.decade              AS decade,
      s.genres              AS genres,
      s."externalId"        AS external_id,
      COALESCE(s."hookStartMs", 0) AS hook_start_ms,
      a."storageKey"        AS "storageKey",
      a."stageByteOffsets"  AS "stageByteOffsets",
      a."byteSize"          AS "byteSize",
      a."ladderRevision"    AS "ladderRevision"
    FROM "Run" r
    JOIN "Game" g ON g.id = r."gameId"
    LEFT JOIN "RunRound" rr
      ON rr."runId" = r.id AND rr."roundIndex" = r."currentRoundIndex"
    LEFT JOIN "Song" s ON s."puzzleId" = rr."puzzleId"
    LEFT JOIN "PuzzleAsset" a
      ON a."puzzleId" = rr."puzzleId" AND a.kind = 'AUDIO_CLIP'::"AssetKind"
    WHERE r.id = ${runId}
  `;

  const row = rows[0];
  if (!row) throw new AttemptFailure({ kind: "not_found" });

  const outcome = (row.round_outcome ?? "PENDING") as "PENDING" | "SOLVED" | "FAILED";
  const stageReached = row.stage_reached ?? 1;
  const attemptsUsed = row.attempts_used ?? 0;
  const inProgress = row.status === "IN_PROGRESS";

  return {
    ladderRevision: row.ladder_revision,
    audio: inProgress ? pendingAudio(row, stageReached) : null,
    result: {
      outcome,
      stageReached,
      attemptsUsed,
      attemptsRemaining: row.max_attempts - attemptsUsed,
      nextAudioUrl: inProgress ? `/api/runs/${runId}/audio` : null,
      youtubeVideoId: row.external_id ?? null,
      hookStartMs: row.hook_start_ms,
      livesRemaining: row.lives_remaining,
      runStatus: row.status as AttemptResult["runStatus"],
      roundIndex: row.round_index ?? row.current_round_index,
      currentStreak: row.current_streak,
      bestStreak: row.best_streak,
      // RunRound.points defaults to 0, so read it only once the round has
      // actually resolved — otherwise a replayed attempt reports a score for a
      // live round.
      points: outcome !== "PENDING" ? row.points : null,
      // A replay must reproduce what the original response carried, both ways:
      // the reveal for a round that has resolved, the hint for one still
      // running. Returning null for a resolved round would mean a retried
      // winning guess reports SOLVED with nothing to show for it.
      reveal:
        outcome !== "PENDING" && row.title !== null && row.artist !== null
          ? {
              title: row.title,
              artist: row.artist,
              album: row.album,
              releaseYear: row.release_year,
            }
          : null,
      hint:
        outcome === "PENDING" && row.title !== null
          ? deriveHint(
              {
                title: row.title,
                releaseYear: row.release_year,
                decade: row.decade,
                genres: row.genres ?? [],
              },
              attemptsUsed,
            )
          : null,
      ...computeRewards({
        score: row.score,
        bestStreak: row.best_streak,
        roundsSolved: row.rounds_solved,
        hasPerfectSync: row.has_perfect_sync,
      }),
    },
  };
}

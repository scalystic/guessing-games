import "server-only";
import { prisma } from "@/lib/db";
import { samplePuzzle } from "@/lib/game/selection";
import { scoreSolvedRound, solveExtendsStreak } from "@/lib/game/scoring/v1";

/// One attempt — a guess or a skip. Both advance the ladder, so they share every
/// line of this except whether a correct answer is even possible.
///
/// The whole thing runs in one transaction over a row-locked Run. Two
/// simultaneous submits must not both advance the stage, and the guard is
/// layered: SELECT ... FOR UPDATE, then Run.version, then the
/// @@unique([roundId, attemptIndex]) backstop if a caller omits an idempotency
/// key. See docs/game-engine.md § Server authority.

export type AttemptInput = {
  runId: string;
  idempotencyKey: string;
  /// Typeahead selection. Null for a skip.
  guessedPuzzleId: string | null;
  /// Kept only for tuning aliases — never used to decide correctness.
  rawInput: string | null;
  isSkip: boolean;
};

export type AttemptResult = {
  outcome: "PENDING" | "SOLVED" | "FAILED";
  stageReached: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  /// Null once the round resolves — there is no more audio to earn.
  nextAudioUrl: string | null;
  livesRemaining: number;
  runStatus: "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "EXPIRED";
  roundIndex: number;
  /// Null while PENDING.
  points: number | null;
  /// Revealed only once the round resolves.
  reveal: { title: string; artist: string; album: string | null } | null;
};

export type AttemptError =
  | { kind: "not_in_progress"; status: string }
  | { kind: "no_current_round" }
  | { kind: "already_resolved" };

export class AttemptFailure extends Error {
  constructor(public readonly detail: AttemptError) {
    super(detail.kind);
  }
}

export async function applyAttempt(input: AttemptInput): Promise<AttemptResult> {
  return prisma.$transaction(async (tx) => {
    // Row lock first. Everything below reads state that a concurrent attempt
    // would otherwise be mutating underneath us.
    const locked = await tx.$queryRaw<{ id: string; version: number }[]>`
      SELECT id, version FROM "Run" WHERE id = ${input.runId} FOR UPDATE
    `;
    if (locked.length === 0) throw new AttemptFailure({ kind: "no_current_round" });

    const run = await tx.run.findUniqueOrThrow({
      where: { id: input.runId },
      select: {
        id: true,
        status: true,
        currentRoundIndex: true,
        livesRemaining: true,
        maxRounds: true,
        currentStreak: true,
        bestStreak: true,
        score: true,
        xpEarned: true,
        roundsSolved: true,
        roundsFailed: true,
        totalRevealMs: true,
        playerId: true,
        gameId: true,
        game: {
          select: {
            maxAttempts: true,
            revealLadder: true,
            puzzleCooldownDays: true,
            startPopularity: true,
            rampPerRound: true,
            minPopularity: true,
            sampleWindow: true,
          },
        },
      },
    });

    if (run.status !== "IN_PROGRESS") {
      throw new AttemptFailure({ kind: "not_in_progress", status: run.status });
    }

    const round = await tx.runRound.findUnique({
      where: { runId_roundIndex: { runId: run.id, roundIndex: run.currentRoundIndex } },
      select: {
        id: true,
        roundIndex: true,
        puzzleId: true,
        outcome: true,
        stageReached: true,
        attemptsUsed: true,
      },
    });
    if (!round) throw new AttemptFailure({ kind: "no_current_round" });
    if (round.outcome !== "PENDING") throw new AttemptFailure({ kind: "already_resolved" });

    const maxAttempts = run.game.maxAttempts;
    const ladder = (run.game.revealLadder as number[]) ?? [];

    // Idempotency: a retried request returns the stored result instead of
    // burning a second attempt. Checked inside the lock so two concurrent
    // retries of the SAME key can't both pass.
    const existing = await tx.guess.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { roundId: true },
    });
    if (existing) {
      return describeCurrentState(tx, run.id);
    }

    const attemptIndex = round.attemptsUsed + 1;
    const isCorrect =
      !input.isSkip && input.guessedPuzzleId !== null && input.guessedPuzzleId === round.puzzleId;

    await tx.guess.create({
      data: {
        roundId: round.id,
        attemptIndex,
        stageAtGuess: round.stageReached,
        guessedPuzzleId: input.guessedPuzzleId,
        rawInput: input.rawInput,
        isCorrect,
        isSkip: input.isSkip,
        idempotencyKey: input.idempotencyKey,
      },
    });

    // Audio the player has now heard, for the leaderboard tie-break.
    const revealMs = ladder[round.stageReached - 1] ?? 0;

    if (isCorrect) {
      return resolveSolved(tx, { run, round, attemptIndex, revealMs });
    }

    // A correct guess on the last attempt still solves; a wrong one there fails.
    if (attemptIndex >= maxAttempts) {
      return resolveFailed(tx, { run, round, attemptIndex, revealMs });
    }

    // Still PENDING — advance the ladder and hand over the next slice.
    const updated = await tx.runRound.update({
      where: { id: round.id },
      data: { attemptsUsed: attemptIndex, stageReached: round.stageReached + 1 },
      select: { stageReached: true, attemptsUsed: true },
    });
    await tx.run.update({
      where: { id: run.id },
      data: { version: { increment: 1 }, totalRevealMs: { increment: revealMs } },
    });

    return {
      outcome: "PENDING",
      stageReached: updated.stageReached,
      attemptsUsed: updated.attemptsUsed,
      attemptsRemaining: maxAttempts - updated.attemptsUsed,
      nextAudioUrl: `/api/runs/${run.id}/audio`,
      livesRemaining: run.livesRemaining,
      runStatus: "IN_PROGRESS",
      roundIndex: round.roundIndex,
      points: null,
      reveal: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type ResolveArgs = {
  run: {
    id: string;
    playerId: string;
    gameId: string;
    livesRemaining: number;
    maxRounds: number | null;
    currentRoundIndex: number;
    currentStreak: number;
    bestStreak: number;
    game: {
      maxAttempts: number;
      puzzleCooldownDays: number;
      startPopularity: number;
      rampPerRound: number;
      minPopularity: number;
      sampleWindow: number;
    };
  };
  round: { id: string; roundIndex: number; puzzleId: string; stageReached: number };
  attemptIndex: number;
  revealMs: number;
};

async function resolveSolved(tx: Tx, args: ResolveArgs): Promise<AttemptResult> {
  const { run, round, attemptIndex, revealMs } = args;

  const { points, xp } = scoreSolvedRound({
    stageReached: round.stageReached,
    roundIndex: round.roundIndex,
    currentStreak: run.currentStreak,
    attemptsUsed: attemptIndex,
    maxAttempts: run.game.maxAttempts,
  });

  const extends_ = solveExtendsStreak(round.stageReached);
  const nextStreak = extends_ ? run.currentStreak + 1 : 0;

  await tx.runRound.update({
    where: { id: round.id },
    data: {
      outcome: "SOLVED",
      attemptsUsed: attemptIndex,
      points,
      xp,
      resolvedAt: new Date(),
    },
  });

  await recordSeen(tx, run.playerId, round.puzzleId, "SOLVED");
  await tx.puzzle.update({
    where: { id: round.puzzleId },
    data: {
      playCount: { increment: 1 },
      solveCount: { increment: 1 },
      // Solved within the first 3 stages — the signal that drives retuning.
      earlySolveCount: round.stageReached <= 3 ? { increment: 1 } : undefined,
    },
  });

  return advance(tx, {
    ...args,
    scoreDelta: points,
    xpDelta: xp,
    revealMs,
    solved: true,
    nextStreak,
    livesRemaining: run.livesRemaining,
  });
}

async function resolveFailed(tx: Tx, args: ResolveArgs): Promise<AttemptResult> {
  const { run, round, attemptIndex, revealMs } = args;

  await tx.runRound.update({
    where: { id: round.id },
    data: {
      outcome: "FAILED",
      attemptsUsed: attemptIndex,
      points: 0,
      xp: 0,
      resolvedAt: new Date(),
    },
  });

  await recordSeen(tx, run.playerId, round.puzzleId, "FAILED");
  await tx.puzzle.update({
    where: { id: round.puzzleId },
    data: { playCount: { increment: 1 } },
  });

  return advance(tx, {
    ...args,
    scoreDelta: 0,
    xpDelta: 0,
    revealMs,
    solved: false,
    nextStreak: 0,
    livesRemaining: run.livesRemaining - 1,
  });
}

/// Shared tail: bank the round, then either open the next one or finalize.
async function advance(
  tx: Tx,
  args: ResolveArgs & {
    scoreDelta: number;
    xpDelta: number;
    solved: boolean;
    nextStreak: number;
    livesRemaining: number;
  },
): Promise<AttemptResult> {
  const { run, round, attemptIndex, revealMs, livesRemaining, nextStreak } = args;

  const outOfLives = livesRemaining <= 0;
  const roundsExhausted = run.maxRounds !== null && round.roundIndex >= run.maxRounds;

  const reveal = await tx.song.findUnique({
    where: { puzzleId: round.puzzleId },
    select: { title: true, artist: true, album: true },
  });

  // Either terminal condition completes the run. A daily that runs out of lives
  // at round 7 still COMPLETES — it just scores less.
  if (outOfLives || roundsExhausted) {
    await tx.run.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
        version: { increment: 1 },
        livesRemaining: Math.max(0, livesRemaining),
        currentStreak: nextStreak,
        bestStreak: Math.max(run.bestStreak, nextStreak),
        score: { increment: args.scoreDelta },
        xpEarned: { increment: args.xpDelta },
        roundsSolved: args.solved ? { increment: 1 } : undefined,
        roundsFailed: args.solved ? undefined : { increment: 1 },
        totalRevealMs: { increment: revealMs },
      },
    });

    return {
      outcome: args.solved ? "SOLVED" : "FAILED",
      stageReached: round.stageReached,
      attemptsUsed: attemptIndex,
      attemptsRemaining: 0,
      nextAudioUrl: null,
      livesRemaining: Math.max(0, livesRemaining),
      runStatus: "COMPLETED",
      roundIndex: round.roundIndex,
      points: args.scoreDelta,
      reveal: reveal ?? null,
    };
  }

  const nextIndex = round.roundIndex + 1;
  const used = await tx.runRound.findMany({
    where: { runId: run.id },
    select: { puzzleId: true },
  });

  const pick = await samplePuzzle({
    gameId: run.gameId,
    playerId: run.playerId,
    roundIndex: nextIndex,
    curve: run.game,
    maxAttempts: run.game.maxAttempts,
    cooldownDays: run.game.puzzleCooldownDays,
    excludePuzzleIds: used.map((r) => r.puzzleId),
  });

  // Nothing left to play. Completing beats stranding the player mid-run with a
  // 500, and the score they earned still counts.
  if (!pick) {
    await tx.run.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
        version: { increment: 1 },
        livesRemaining,
        currentStreak: nextStreak,
        bestStreak: Math.max(run.bestStreak, nextStreak),
        score: { increment: args.scoreDelta },
        xpEarned: { increment: args.xpDelta },
        roundsSolved: args.solved ? { increment: 1 } : undefined,
        roundsFailed: args.solved ? undefined : { increment: 1 },
        totalRevealMs: { increment: revealMs },
      },
    });

    return {
      outcome: args.solved ? "SOLVED" : "FAILED",
      stageReached: round.stageReached,
      attemptsUsed: attemptIndex,
      attemptsRemaining: 0,
      nextAudioUrl: null,
      livesRemaining,
      runStatus: "COMPLETED",
      roundIndex: round.roundIndex,
      points: args.scoreDelta,
      reveal: reveal ?? null,
    };
  }

  await tx.runRound.create({
    data: {
      runId: run.id,
      roundIndex: nextIndex,
      puzzleId: pick.puzzleId,
      targetPopularity: pick.targetPopularity,
      puzzlePopularity: pick.popularity,
    },
  });

  await tx.run.update({
    where: { id: run.id },
    data: {
      currentRoundIndex: nextIndex,
      version: { increment: 1 },
      livesRemaining,
      currentStreak: nextStreak,
      bestStreak: Math.max(run.bestStreak, nextStreak),
      score: { increment: args.scoreDelta },
      xpEarned: { increment: args.xpDelta },
      roundsSolved: args.solved ? { increment: 1 } : undefined,
      roundsFailed: args.solved ? undefined : { increment: 1 },
      totalRevealMs: { increment: revealMs },
    },
  });

  return {
    outcome: args.solved ? "SOLVED" : "FAILED",
    stageReached: round.stageReached,
    attemptsUsed: attemptIndex,
    attemptsRemaining: 0,
    // Points at the NEXT round's stage 1.
    nextAudioUrl: `/api/runs/${run.id}/audio`,
    livesRemaining,
    runStatus: "IN_PROGRESS",
    roundIndex: round.roundIndex,
    points: args.scoreDelta,
    reveal: reveal ?? null,
  };
}

async function recordSeen(
  tx: Tx,
  playerId: string,
  puzzleId: string,
  outcome: "SOLVED" | "FAILED",
): Promise<void> {
  await tx.playerPuzzleHistory.upsert({
    where: { playerId_puzzleId: { playerId, puzzleId } },
    create: { playerId, puzzleId, lastOutcome: outcome },
    update: { seenCount: { increment: 1 }, lastOutcome: outcome, lastSeenAt: new Date() },
  });
}

/// Replay path for a duplicate idempotency key: report where the run is now
/// without touching anything.
async function describeCurrentState(tx: Tx, runId: string): Promise<AttemptResult> {
  const run = await tx.run.findUniqueOrThrow({
    where: { id: runId },
    select: {
      status: true,
      currentRoundIndex: true,
      livesRemaining: true,
      game: { select: { maxAttempts: true } },
    },
  });

  const round = await tx.runRound.findUnique({
    where: { runId_roundIndex: { runId, roundIndex: run.currentRoundIndex } },
    select: { outcome: true, stageReached: true, attemptsUsed: true, roundIndex: true, points: true },
  });

  return {
    outcome: round?.outcome ?? "PENDING",
    stageReached: round?.stageReached ?? 1,
    attemptsUsed: round?.attemptsUsed ?? 0,
    attemptsRemaining: run.game.maxAttempts - (round?.attemptsUsed ?? 0),
    nextAudioUrl: run.status === "IN_PROGRESS" ? `/api/runs/${runId}/audio` : null,
    livesRemaining: run.livesRemaining,
    runStatus: run.status,
    roundIndex: round?.roundIndex ?? run.currentRoundIndex,
    // RunRound.points defaults to 0, so read it only once the round has actually
    // resolved — otherwise a replayed attempt reports a score for a live round.
    points: round && round.outcome !== "PENDING" ? round.points : null,
    reveal: null,
  };
}

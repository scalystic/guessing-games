import "server-only";
import { prisma } from "@/lib/db";
import { samplePuzzle } from "@/lib/game/selection";
import { scoreSolvedRound, solveExtendsStreak } from "@/lib/game/scoring/v1";
import { deriveHint, hintSelect, type RoundHint } from "@/lib/game/hint";

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

export type AchievementEntry = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  unlocked: boolean;
  color: string;
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

export async function computeRewards(
  tx: Tx,
  runId: string,
  score: number,
  bestStreak: number,
): Promise<{
  score: number;
  level: number;
  xpProgress: number;
  xpPerLevel: number;
  rankName: string;
  achievements: AchievementEntry[];
}> {
  const allRounds = await tx.runRound.findMany({
    where: { runId },
    select: { outcome: true, attemptsUsed: true },
  });

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

  const roundsSolved = allRounds.filter((r) => r.outcome === "SOLVED").length;
  const hasPerfectSync = allRounds.some((r) => r.outcome === "SOLVED" && r.attemptsUsed === 1);

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

  return {
    score,
    level,
    xpProgress,
    xpPerLevel,
    rankName,
    achievements,
  };
}

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
        mode: true,
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

    const rewards = await computeRewards(tx, run.id, run.score, run.bestStreak);
    return {
      outcome: "PENDING",
      stageReached: updated.stageReached,
      attemptsUsed: updated.attemptsUsed,
      attemptsRemaining: maxAttempts - updated.attemptsUsed,
      nextAudioUrl: `/api/runs/${run.id}/audio`,
      livesRemaining: run.livesRemaining,
      runStatus: "IN_PROGRESS",
      roundIndex: round.roundIndex,
      currentStreak: run.currentStreak,
      bestStreak: run.bestStreak,
      points: null,
      reveal: null,
      hint: await hintFor(tx, round.puzzleId, updated.attemptsUsed),
      ...rewards,
    };
  });
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/// Hint for a round still in progress. Cheap enough to fetch unconditionally,
/// but skipped before the second attempt so an early round costs no query.
async function hintFor(
  tx: Tx,
  puzzleId: string,
  attemptsUsed: number,
): Promise<RoundHint | null> {
  if (attemptsUsed < 2) return null;

  const song = await tx.song.findUnique({
    where: { puzzleId },
    select: hintSelect,
  });

  // A puzzle with no Song row can't be hinted. Selection requires an audio
  // asset, not a Song, so this is reachable rather than impossible.
  return song ? deriveHint(song, attemptsUsed) : null;
}

/// Whether running out of lives ends the run.
///
/// Only DAILY, where a bounded attempt IS the format. PRACTICE and ENDLESS are
/// open-ended, and completing one of those runs is not a small thing: the
/// streak, the score and the played-songs list are all columns on Run, so the
/// client has no choice but to start a fresh run and draw zeroes. Three misses
/// used to wipe a practice session that way — which reads as the app resetting
/// itself, not as a game over. Lives are still tracked and still shown; they
/// just don't terminate an open-ended run.
function livesEndTheRun(mode: RunMode): boolean {
  return mode === "DAILY";
}

type RunMode = "DAILY" | "PRACTICE" | "ENDLESS";

type ResolveArgs = {
  run: {
    id: string;
    playerId: string;
    gameId: string;
    mode: RunMode;
    livesRemaining: number;
    maxRounds: number | null;
    currentRoundIndex: number;
    currentStreak: number;
    bestStreak: number;
    score: number;
    xpEarned: number;
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

  const nextStreak = solveExtendsStreak() ? run.currentStreak + 1 : 0;

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
    // Floored rather than allowed to go negative: an open-ended run keeps
    // playing past zero, and a run of -4 lives is a number nothing can render.
    livesRemaining: Math.max(0, run.livesRemaining - 1),
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

  const outOfLives = livesEndTheRun(run.mode) && livesRemaining <= 0;
  const roundsExhausted = run.maxRounds !== null && round.roundIndex >= run.maxRounds;
  const bestStreak = Math.max(run.bestStreak, nextStreak);

  const reveal = await tx.song.findUnique({
    where: { puzzleId: round.puzzleId },
    select: { title: true, artist: true, album: true, releaseYear: true },
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
        bestStreak,
        score: { increment: args.scoreDelta },
        xpEarned: { increment: args.xpDelta },
        roundsSolved: args.solved ? { increment: 1 } : undefined,
        roundsFailed: args.solved ? undefined : { increment: 1 },
        totalRevealMs: { increment: revealMs },
      },
    });

    const finalScore = run.score + args.scoreDelta;
    const finalBestStreak = bestStreak;
    const rewards = await computeRewards(tx, run.id, finalScore, finalBestStreak);
    return {
      outcome: args.solved ? "SOLVED" : "FAILED",
      stageReached: round.stageReached,
      attemptsUsed: attemptIndex,
      attemptsRemaining: 0,
      nextAudioUrl: null,
      livesRemaining: Math.max(0, livesRemaining),
      runStatus: "COMPLETED",
      roundIndex: round.roundIndex,
      currentStreak: nextStreak,
      bestStreak,
      points: args.scoreDelta,
      reveal: reveal ?? null,
      // The round is over; `reveal` says everything a hint would have.
      hint: null,
      ...rewards,
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
        bestStreak,
        score: { increment: args.scoreDelta },
        xpEarned: { increment: args.xpDelta },
        roundsSolved: args.solved ? { increment: 1 } : undefined,
        roundsFailed: args.solved ? undefined : { increment: 1 },
        totalRevealMs: { increment: revealMs },
      },
    });

    const finalScore = run.score + args.scoreDelta;
    const finalBestStreak = bestStreak;
    const rewards = await computeRewards(tx, run.id, finalScore, finalBestStreak);
    return {
      outcome: args.solved ? "SOLVED" : "FAILED",
      stageReached: round.stageReached,
      attemptsUsed: attemptIndex,
      attemptsRemaining: 0,
      nextAudioUrl: null,
      livesRemaining,
      runStatus: "COMPLETED",
      roundIndex: round.roundIndex,
      currentStreak: nextStreak,
      bestStreak,
      points: args.scoreDelta,
      reveal: reveal ?? null,
      hint: null,
      ...rewards,
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
      bestStreak,
      score: { increment: args.scoreDelta },
      xpEarned: { increment: args.xpDelta },
      roundsSolved: args.solved ? { increment: 1 } : undefined,
      roundsFailed: args.solved ? undefined : { increment: 1 },
      totalRevealMs: { increment: revealMs },
    },
  });

  const finalScore = run.score + args.scoreDelta;
  const finalBestStreak = bestStreak;
  const rewards = await computeRewards(tx, run.id, finalScore, finalBestStreak);
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
    currentStreak: nextStreak,
    bestStreak,
    points: args.scoreDelta,
    reveal: reveal ?? null,
    // The round just resolved. The NEXT round starts at attempt 0, which earns
    // no hint — so null is right here too, not a hint for the new puzzle.
    hint: null,
    ...rewards,
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
      currentStreak: true,
      bestStreak: true,
      score: true,
      game: { select: { maxAttempts: true } },
    },
  });

  const round = await tx.runRound.findUnique({
    where: { runId_roundIndex: { runId, roundIndex: run.currentRoundIndex } },
    select: {
      outcome: true,
      stageReached: true,
      attemptsUsed: true,
      roundIndex: true,
      points: true,
      puzzleId: true,
    },
  });

  const rewards = await computeRewards(tx, runId, run.score, run.bestStreak);

  return {
    outcome: round?.outcome ?? "PENDING",
    stageReached: round?.stageReached ?? 1,
    attemptsUsed: round?.attemptsUsed ?? 0,
    attemptsRemaining: run.game.maxAttempts - (round?.attemptsUsed ?? 0),
    nextAudioUrl: run.status === "IN_PROGRESS" ? `/api/runs/${runId}/audio` : null,
    livesRemaining: run.livesRemaining,
    runStatus: run.status,
    roundIndex: round?.roundIndex ?? run.currentRoundIndex,
    currentStreak: run.currentStreak,
    bestStreak: run.bestStreak,
    // RunRound.points defaults to 0, so read it only once the round has actually
    // resolved — otherwise a replayed attempt reports a score for a live round.
    points: round && round.outcome !== "PENDING" ? round.points : null,
    // A replay must reproduce what the original response carried, both ways: the
    // reveal for a round that has resolved, the hint for one still running.
    // Returning null for a resolved round would mean a retried winning guess
    // reports SOLVED with nothing to show for it.
    reveal:
      round && round.outcome !== "PENDING"
        ? await tx.song.findUnique({
            where: { puzzleId: round.puzzleId },
            select: { title: true, artist: true, album: true, releaseYear: true },
          })
        : null,
    hint:
      round && round.outcome === "PENDING"
        ? await hintFor(tx, round.puzzleId, round.attemptsUsed)
        : null,
    ...rewards,
  };
}

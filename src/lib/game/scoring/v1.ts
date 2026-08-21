import "server-only";

/// Scoring version 1. Pinned per run via Run.scoringVersion, so rebalancing
/// means adding v2 alongside this file rather than editing it — old runs stay
/// explainable after a change. See docs/game-engine.md § Scoring.
///
/// The formula is CODE while the ladder and popularity curve are DATA. That
/// split is deliberate: difficulty gets retuned often and without a deploy,
/// scoring almost never and never silently.

export const SCORING_VERSION = 1;

/// Points for solving at each stage, indexed by stageReached - 1. Steeply
/// front-loaded: guessing from 200ms is worth 10x guessing from 7s.
const STAGE_BASE = [1000, 800, 600, 400, 250, 100];

/// Later rounds are the obscure ones, so they pay more. 0.05 per round makes
/// round 10 worth 1.45x round 1 — steeper than a 20-round day would need,
/// because 10 rounds have to cover the same popularity span.
const DEPTH_BONUS_PER_ROUND = 0.05;

/// First-stage solves only. Capped so a hot streak can't dominate the board.
const STREAK_BONUS_PER_SOLVE = 0.1;
const STREAK_BONUS_CAP = 0.5;

/// XP is deliberately flatter than points — score is spiky and competitive, XP
/// should feel like steady progress. Separate columns; never derive one from the
/// other at read time.
const XP_BASE = 10;
const XP_PER_UNUSED_ATTEMPT = 4;

export type ScoreInput = {
  /// 1-based stage the round was solved at.
  stageReached: number;
  /// 1-based round index within the run.
  roundIndex: number;
  /// Consecutive first-stage solves BEFORE this round.
  currentStreak: number;
  attemptsUsed: number;
  maxAttempts: number;
};

export type ScoreResult = { points: number; xp: number };

/// A failed round scores nothing at all — call this only for a solve.
export function scoreSolvedRound(input: ScoreInput): ScoreResult {
  const { stageReached, roundIndex, currentStreak, attemptsUsed, maxAttempts } = input;

  const base = STAGE_BASE[stageReached - 1];
  if (base === undefined) {
    throw new Error(
      `stageReached ${stageReached} has no base score — STAGE_BASE covers 1..${STAGE_BASE.length}`,
    );
  }

  const depthBonus = 1 + DEPTH_BONUS_PER_ROUND * (roundIndex - 1);
  const streakBonus =
    1 + Math.min(STREAK_BONUS_PER_SOLVE * currentStreak, STREAK_BONUS_CAP);

  return {
    points: Math.round(base * depthBonus * streakBonus),
    xp: XP_BASE + XP_PER_UNUSED_ATTEMPT * (maxAttempts - attemptsUsed),
  };
}

/// Whether a solve at this stage extends the streak. Only a first-stage solve
/// counts — the streak multiplier rewards instant recognition, not persistence.
export function solveExtendsStreak(stageReached: number): boolean {
  return stageReached === 1;
}

/// Client-safe mirror of the point half of scoring/v1.ts (scoreSolvedRound),
/// for a live "if you solved right now" display only. That module is marked
/// `import "server-only"` — the server is the only place a score is ever
/// actually awarded — so this is a deliberate, minimal duplication of the
/// PURE MATH, not a second source of truth. If STAGE_BASE or the bonus
/// weights in scoring/v1.ts ever change, update both.
///
/// Notably NOT time-based: this game's real formula depends on which stage
/// you've reached, the round's depth, and your streak — never a clock. So
/// unlike a decaying countdown, this preview is exact, not a guess: it moves
/// only when one of those real inputs actually changes (a stage advances).

const STAGE_BASE = [1000, 800, 600, 400, 250, 100];
const DEPTH_BONUS_PER_ROUND = 0.05;
const STREAK_BONUS_PER_SOLVE = 0.1;
const STREAK_BONUS_CAP = 0.5;

export function previewPoints(stageReached: number, roundIndex: number, currentStreak: number): number | null {
  const base = STAGE_BASE[stageReached - 1];
  if (base === undefined) return null;

  const depthBonus = 1 + DEPTH_BONUS_PER_ROUND * (roundIndex - 1);
  const streakBonus = 1 + Math.min(STREAK_BONUS_PER_SOLVE * currentStreak, STREAK_BONUS_CAP);

  return Math.round(base * depthBonus * streakBonus);
}

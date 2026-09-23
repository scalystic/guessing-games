-- The previous backfill (20260923091314) counted first-attempt solves across
-- every RunRound regardless of the parent Run's status. That overcounts:
-- roundsPlayed/roundsSolved only ever accumulate from a run that reached
-- completeRun() (see rollUpPlayerStats in src/lib/game/attempt.ts), i.e.
-- status = 'COMPLETED' — an abandoned or still-IN_PROGRESS run's rounds are
-- real rows with real outcomes, but were never folded into the rollup. This
-- recomputes instantSolveCount with the same COMPLETED-only scope, so it can
-- never exceed roundsSolved for the same player.
UPDATE "PlayerGameStat" pgs
SET "instantSolveCount" = (
  SELECT COUNT(*)::int
  FROM "RunRound" rr
  JOIN "Run" r ON r.id = rr."runId"
  WHERE r."playerId" = pgs."playerId"
    AND r."gameId" = pgs."gameId"
    AND r.status = 'COMPLETED'::"RunStatus"
    AND rr.outcome = 'SOLVED'::"RoundOutcome"
    AND rr."attemptsUsed" = 1
);

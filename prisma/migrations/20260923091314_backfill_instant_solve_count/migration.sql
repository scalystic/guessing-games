-- Backfill PlayerGameStat.instantSolveCount from existing RunRound history.
-- rollUpPlayerStats() only started writing this column going forward (see
-- src/lib/game/attempt.ts); without this, every player's lifetime count
-- would start at 0 regardless of how many first-attempt solves they already
-- have on record.
UPDATE "PlayerGameStat" pgs
SET "instantSolveCount" = sub.cnt
FROM (
  SELECT r."playerId" AS "playerId", r."gameId" AS "gameId", COUNT(*)::int AS cnt
  FROM "RunRound" rr
  JOIN "Run" r ON r.id = rr."runId"
  WHERE rr.outcome = 'SOLVED'::"RoundOutcome" AND rr."attemptsUsed" = 1
  GROUP BY r."playerId", r."gameId"
) sub
WHERE pgs."playerId" = sub."playerId" AND pgs."gameId" = sub."gameId";

-- A daily challenge may now use the same song in more than one round
-- (e.g. a long, multi-round challenge that reuses a limited song pool).
-- The composite primary key (dailyChallengeId, roundIndex) still keeps
-- one entry per round; only the per-song uniqueness is removed.
DROP INDEX "DailyChallengePuzzle_dailyChallengeId_puzzleId_key";

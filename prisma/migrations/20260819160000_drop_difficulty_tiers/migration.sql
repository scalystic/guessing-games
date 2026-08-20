-- DropForeignKey
ALTER TABLE "GameTier" DROP CONSTRAINT "GameTier_gameId_fkey";

-- DropIndex
DROP INDEX "DailyChallenge_gameId_dayKey_idx";

-- DropIndex
DROP INDEX "DailyChallenge_gameId_tier_dayKey_key";

-- DropIndex
DROP INDEX "LeaderboardEntry_gameId_boardType_tier_periodKey_playerId_key";

-- DropIndex
DROP INDEX "LeaderboardEntry_gameId_boardType_tier_periodKey_score_idx";

-- DropIndex
DROP INDEX "PlayerGameStat_gameId_tier_bestRunScore_idx";

-- DropIndex
DROP INDEX "PlayerGameStat_playerId_gameId_tier_key";

-- DropIndex
DROP INDEX "Puzzle_gameId_difficultyTier_idx";

-- DropIndex
DROP INDEX "Run_gameId_mode_tier_status_idx";

-- DropIndex
DROP INDEX "Run_gameId_tier_isRanked_score_idx";

-- DropIndex
DROP INDEX "Run_playerId_gameId_tier_dayKey_key";

-- AlterTable
ALTER TABLE "DailyChallenge" DROP COLUMN "tier";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "minPopularity" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "rampPerRound" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
ADD COLUMN     "sampleWindow" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "startPopularity" INTEGER NOT NULL DEFAULT 90,
ALTER COLUMN "dailyRounds" SET DEFAULT 10;

-- AlterTable
ALTER TABLE "LeaderboardEntry" DROP COLUMN "tier";

-- AlterTable
ALTER TABLE "PlayerGameStat" DROP COLUMN "tier";

-- AlterTable
ALTER TABLE "Puzzle" DROP COLUMN "difficultyTier";

-- AlterTable
ALTER TABLE "Run" DROP COLUMN "tier";

-- DropTable
DROP TABLE "GameTier";

-- DropEnum
DROP TYPE "DifficultyTier";

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallenge_gameId_dayKey_key" ON "DailyChallenge"("gameId", "dayKey");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_gameId_boardType_periodKey_score_idx" ON "LeaderboardEntry"("gameId", "boardType", "periodKey", "score");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_gameId_boardType_periodKey_playerId_key" ON "LeaderboardEntry"("gameId", "boardType", "periodKey", "playerId");

-- CreateIndex
CREATE INDEX "PlayerGameStat_gameId_bestRunScore_idx" ON "PlayerGameStat"("gameId", "bestRunScore");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_playerId_gameId_key" ON "PlayerGameStat"("playerId", "gameId");

-- CreateIndex
CREATE INDEX "Run_gameId_mode_status_idx" ON "Run"("gameId", "mode", "status");

-- CreateIndex
CREATE INDEX "Run_gameId_isRanked_score_idx" ON "Run"("gameId", "isRanked", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Run_playerId_gameId_dayKey_key" ON "Run"("playerId", "gameId", "dayKey");

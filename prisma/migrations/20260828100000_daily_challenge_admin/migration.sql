-- Add admin-configurable fields to DailyChallenge
ALTER TABLE "DailyChallenge" ADD COLUMN "title" TEXT;
ALTER TABLE "DailyChallenge" ADD COLUMN "rewardCoins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DailyChallenge" ADD COLUMN "rewardXp" INTEGER NOT NULL DEFAULT 0;

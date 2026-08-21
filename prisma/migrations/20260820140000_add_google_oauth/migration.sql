-- Backfills a column applied to dev via `prisma db push` during the Google
-- OAuth work, which left no migration behind. Without this, `migrate deploy`
-- against a fresh database builds Player with no googleId and OAuth login
-- fails at runtime.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_googleId_key" ON "Player"("googleId");

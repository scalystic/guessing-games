-- AlterTable
ALTER TABLE "Song" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT;

-- CreateIndex
CREATE INDEX "Song_isLocked_idx" ON "Song"("isLocked");

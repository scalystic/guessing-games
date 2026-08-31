-- Add createdAt to Song table with a default of now() for existing rows
ALTER TABLE "Song" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Index for newest-first sort
CREATE INDEX "Song_createdAt_idx" ON "Song"("createdAt");

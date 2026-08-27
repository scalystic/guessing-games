-- CreateEnum
CREATE TYPE "RunEra" AS ENUM ('NINETIES', 'TWO_THOUSANDS');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "decadeFilter" "RunEra";

-- CreateIndex
CREATE INDEX "Song_decade_idx" ON "Song"("decade");

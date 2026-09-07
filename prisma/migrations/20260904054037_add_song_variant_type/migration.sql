-- CreateEnum
CREATE TYPE "SongVariant" AS ENUM ('INSTRUMENTAL', 'LOFI', 'REMIX', 'MASHUP', 'COVER', 'LIVE', 'ALTERNATE', 'MISMATCH');

-- AlterTable
ALTER TABLE "Song" ADD COLUMN     "variantType" "SongVariant";

-- CreateIndex
CREATE INDEX "Song_variantType_idx" ON "Song"("variantType");

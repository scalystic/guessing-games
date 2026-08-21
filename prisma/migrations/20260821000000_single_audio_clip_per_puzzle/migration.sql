-- One AUDIO_CLIP per puzzle instead of one row per reveal stage.
-- The ladder is now served by byte-range slicing a single object, so per-stage
-- rows (and per-stage uploads) go away. Any existing PuzzleAsset rows are
-- per-stage fragments that no longer decode standalone under this model, so
-- they are dropped rather than migrated -- clips must be re-cut at ingest.
DELETE FROM "PuzzleAsset";

-- DropIndex
DROP INDEX "PuzzleAsset_puzzleId_stage_key";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "ladderRevision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PuzzleAsset" DROP COLUMN "stage",
ADD COLUMN     "ladderRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "stageByteOffsets" INTEGER[];

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleAsset_puzzleId_kind_key" ON "PuzzleAsset"("puzzleId", "kind");

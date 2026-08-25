-- The film a track is from, when it is from one. Nullable with no backfill:
-- Song.album holds the store collection name, which for a film track is the
-- film plus a soundtrack qualifier and for a single is not a film at all, so
-- there is nothing here that can be derived in SQL. Existing rows get it from
-- `npm run metadata --overwrite` or by hand in the admin form.
ALTER TABLE "Song" ADD COLUMN "movie" TEXT;

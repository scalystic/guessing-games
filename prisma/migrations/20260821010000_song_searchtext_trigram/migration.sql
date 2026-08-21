-- Typeahead index for Song.searchText.
--
-- The btree Prisma created from a bare @@index is useless here: the typeahead
-- matches substrings ("bohem" -> "bohemian rhapsody") and ranks by similarity,
-- neither of which a btree can serve. A trigram GIN handles both.
--
-- CREATE EXTENSION is raw because the `postgresqlExtensions` preview feature is
-- off, so Prisma neither manages nor drifts on extensions. The INDEX itself IS
-- declared in schema.prisma via @@index([searchText(ops: raw("gin_trgm_ops"))],
-- type: Gin), so Prisma keeps managing it -- do not move it into raw SQL or the
-- next migrate will try to recreate it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropIndex
DROP INDEX "Song_searchText_idx";

-- CreateIndex
CREATE INDEX "Song_searchText_idx" ON "Song" USING GIN ("searchText" gin_trgm_ops);

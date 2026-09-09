/// Catalog-side entry point for the typeahead index.
///
/// `buildSearchText` used to be a SECOND implementation living here, and it had
/// drifted: this copy mapped apostrophes to a space while lib/game's copy
/// deletes them, so an ingest through this path indexed "don t stop me now"
/// while the search endpoint queried for "dont stop me now" — a track that
/// simply could not be found, with nothing to show it. There is now exactly one
/// normaliser, and it lives next to the endpoint that queries it.
///
/// Re-exported rather than swapped out at the ~6 call sites so
/// scripts/ingest.ts and the admin song routes keep importing the module that
/// also gives them computeDecade.
///
/// Relative, not "@/lib/...": the importers here include tsx-run scripts, which
/// resolve tsconfig path aliases far less reliably than Next's compiler does.
export { buildSearchText, normalizeSearchText } from "../game/search-text";

export function computeDecade(releaseYear: number | null | undefined): number | null {
  return releaseYear ? Math.floor(releaseYear / 10) * 10 : null;
}

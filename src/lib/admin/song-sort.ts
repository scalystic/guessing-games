/**
 * How the admin songs list is ordered.
 *
 * Shared by all three places that have to agree on it: the songs page (which
 * reads the URL on the server), the list component (which renders the controls
 * on the client), and GET /api/song (which turns it into an ORDER BY). A
 * direction-less ?sort= has to resolve the same way in all three, or a
 * hand-typed link shows one order and the arrow in the header claims another.
 */

export type SortKey = "title" | "artist" | "popularity" | "newest";
export type SortDir = "asc" | "desc";

export const SORT_KEYS: SortKey[] = ["title", "artist", "popularity", "newest"];

/// Which direction a sort means when nobody has picked one — and therefore what
/// the first click on a column header gives you. A name column asked for with no
/// direction wants A–Z; popularity and date want the interesting end first (the
/// biggest number, the newest import), because "sort by date" on a review queue
/// means "what came in recently", not "what has been sitting here longest".
///
/// `newest` is the sort key for Song.createdAt and keeps that historical name so
/// already-bookmarked links still resolve: dir=desc is newest first, dir=asc is
/// oldest first.
export function defaultDirFor(sort: SortKey): SortDir {
  return sort === "popularity" || sort === "newest" ? "desc" : "asc";
}

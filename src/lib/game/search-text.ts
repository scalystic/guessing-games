/// Normalisation for the typeahead, shared by the ingest pipeline that WRITES
/// Song.searchText and the search endpoint that QUERIES it.
///
/// Deliberately not `server-only`: scripts/ingest.ts imports this too, and that
/// package throws outside a react-server condition. Nothing here touches I/O.
///
/// Both sides must apply the identical transform. If ingest strips apostrophes
/// and the query doesn't, "don't" never matches "dont" and the failure is
/// invisible — the endpoint just returns nothing for that one track.

/// Strips diacritics and punctuation, collapses whitespace, lowercases.
/// "Don't Stop Me Now" and "Dont Stop Me Now" both become "dont stop me now".
///
/// Apostrophes are DELETED while other punctuation becomes a space, and the
/// distinction is the whole point. Mapping them to a space too would index
/// "don t stop me now", and then a player typing the far more likely "dont
/// stop" matches nothing \u2014 the substring isn't there. Deleting them collapses
/// both spellings onto the same string, which is what makes the two forms
/// interchangeable in the typeahead.
///
/// Also the reason the search endpoint doesn't have to escape LIKE wildcards:
/// `%` and `_` are not in [a-z0-9\s] and are gone by the time a query is used
/// in a pattern.
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Straight and curly apostrophes, plus the modifier letter form that some
    // catalogs use. Removed, not spaced \u2014 see above.
    .replace(/['\u2019\u02bc]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/// The indexed form of a catalog entry: normalised title + artist.
export function buildSearchText(title: string, artist: string): string {
  return normalizeSearchText(`${title} ${artist}`);
}

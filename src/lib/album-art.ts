/// Real cover art, for places that show a candidate/catalog entry the player
/// already picked or typed their way to (admin catalog table, guess
/// autocomplete) — never for the live mystery track itself. See
/// src/lib/cover.ts for why gameplay's reveal UI uses a generated
/// placeholder instead: a real cover there would give away the answer
/// before a guess. A catalog search result is different — its title/artist/
/// album are already shown as plain text, so the art adds no new spoiler.
///
/// Sourced from Apple's iTunes Search API — no key required, CORS-enabled,
/// good enough coverage for a "does this look right" glance. Results are
/// cached by lookup key for the life of the tab so re-rendering the same
/// entry (paging, re-sorting, retyping a query) doesn't refire the lookup.

const ARTWORK_SIZE = "300x300bb";
const cache = new Map<string, Promise<string | null>>();

function lookupKey(title: string, artist: string, album: string | null): string {
  return `${artist.toLowerCase()} ${title.toLowerCase()} ${(album ?? "").toLowerCase()}`;
}

export function fetchAlbumArtUrl(
  title: string,
  artist: string,
  album: string | null,
): Promise<string | null> {
  const key = lookupKey(title, artist, album);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      // Title always has to be in the query — dropping it in favor of the
      // album name (as this used to do) let a compilation album like "30
      // Hits of Pritam" match on artist + album alone, returning whichever
      // track off that compilation iTunes felt like, not the one asked for.
      const term = [artist, title].filter(Boolean).join(" ");
      const params = new URLSearchParams({
        term,
        media: "music",
        entity: "song",
        limit: "1",
      });
      const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
      if (!response.ok) return null;

      const json = await response.json();
      const artworkUrl100: string | undefined = json?.results?.[0]?.artworkUrl100;
      if (!artworkUrl100) return null;

      return artworkUrl100.replace("100x100bb", ARTWORK_SIZE);
    } catch {
      return null;
    }
  })();

  cache.set(key, promise);
  return promise;
}

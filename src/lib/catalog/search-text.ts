/// Normalised title+artist for the trigram index. Strips diacritics and
/// punctuation so "Dont Stop Me Now" matches "Don't Stop Me Now". Shared by
/// scripts/ingest.ts and the admin song actions so both compute Song.searchText
/// identically — never duplicate this logic.
///
/// NFKD decomposes an accented letter into base + combining mark, so
/// stripping the Unicode "Mark" category after normalizing removes the
/// accent and leaves the plain letter (e.g. "Beyoncé" -> "beyonce").
export function buildSearchText(title: string, artist: string): string {
  return `${title} ${artist}`
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeDecade(releaseYear: number | null | undefined): number | null {
  return releaseYear ? Math.floor(releaseYear / 10) * 10 : null;
}

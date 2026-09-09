/// How a song is written on screen, everywhere a song is written on screen.
///
///   Kesariya
///   Arijit Singh · Brahmastra
///
/// Title on top, then the artist and the film. One module so the typeahead, the
/// result panel, the recent-tracks list and the multiplayer reveal cannot drift
/// into four different formats — they did, before this existed.
///
/// This is a DISPLAY layer. It never touches what is stored: the store's own
/// strings stay in the columns (the art lookup in lib/album-art.ts matches
/// better against them, and the typeahead still indexes them through
/// Song.aliases), and the tidying happens on the way to the screen.
///
/// Ingest-time cleanup lives in scripts/lib/cleanup.ts and is far more
/// aggressive — it rewrites the row. Do not reach for that here.

import { normalizeSearchText } from "@/lib/game/search-text";

/// Store bookkeeping that is not part of any name: the edition, the format, the
/// note that a collection is a soundtrack.
///
/// `(Original Motion Picture Soundtrack)`, `- Single`, `- EP`, `(Deluxe)`,
/// `(From "Brahmastra")`, `(Lyrical Video)`.
///
/// Pointedly NOT in here: Remix, Live, Acoustic, Unplugged, Instrumental,
/// Reprise, Cover. Those name a different RECORDING, so hiding them would show
/// two rows as the same song — see Song.variantType, which exists to keep that
/// distinction. Removing "Deluxe" loses nothing; removing "Remix" loses the
/// only thing that told the player which cut they are looking at.
const STORE_NOISE = [
  // Bracketed qualifiers: the whole bracket goes once one of these words is in
  // it, so `(From "Brahmastra")` and `(Original Motion Picture Soundtrack)` are
  // both covered.
  /\s*[([{]\s*(?:from|original\s+motion\s+picture|original\s+soundtrack|motion\s+picture|soundtrack|deluxe|extended|remastered|re-?master|expanded|special\s+edition|bonus\s+track|lyrical|lyric|video|audio|full\s+song|hd)\b[^)\]}]*[)\]}]/gi,
  // Trailing format markers with no bracket: `Kesariya - Single`.
  /\s*[-–—]\s*(?:single|ep|soundtrack|original\s+motion\s+picture\s+soundtrack)\s*$/gi,
  // A bare trailing `Original Motion Picture Soundtrack`, unbracketed.
  /\s*[-–—]?\s*(?:original\s+)?motion\s+picture(?:\s+soundtrack)?\s*$/gi,
] as const;

/// Strip store noise and tidy up what the removal leaves behind.
///
/// Dangling separators are the reason this is more than a `.replace()`: taking
/// the bracket out of `Kesariya (From "Brahmastra") - Single` leaves stray
/// dashes and doubled spaces, and a title rendered as "Kesariya -" reads as a
/// bug rather than as a clean name.
export function cleanSongText(value: string): string {
  let out = value;
  for (const pattern of STORE_NOISE) out = out.replace(pattern, " ");
  return out
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—,:;/]+\s*$/, "")
    .replace(/^\s*[-–—,:;/]+\s*/, "")
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/// The song's name as the player should read it. Falls back to the raw string
/// if cleaning would leave nothing — a title made entirely of qualifiers is a
/// bad row, and showing it is how anyone finds out.
export function songTitle(title: string): string {
  return cleanSongText(title) || title;
}

export type SongLabelParts = {
  title: string;
  artist: string;
  /// The bare film title, set only when something identified the track as film
  /// music. See Song.movie.
  movie?: string | null;
  /// The store collection. Used only when there is no film, and only after
  /// cleaning — for a single it is just the song's name with `- Single` glued
  /// on, which is worth nothing on screen.
  album?: string | null;
};

/// The second line: `Arijit Singh · Brahmastra`, or just `Arijit Singh` when
/// there is no film and the collection has nothing to add.
///
/// The film wins over the collection because it is the bare name — `album` for
/// a film track is the film plus store noise, which is the whole reason
/// Song.movie is a separate column.
export function songSubtitle(song: SongLabelParts): string {
  const artist = cleanSongText(song.artist) || song.artist;

  // A curated film is always shown, even for a title track where it repeats the
  // song's name: `movie` is set by hand or by an explicit signal, so "Animal ·
  // Animal" is a fact about the track rather than a stray duplicate.
  if (song.movie) {
    const movie = cleanSongText(song.movie);
    if (movie) return `${artist} · ${movie}`;
  }

  // The collection, on the other hand, is whatever the store called it. Once
  // `- Single` comes off it is usually just the song's name again, and
  // sometimes the artist's — a line's worth of nothing either way. Compared
  // normalised so punctuation and case can't smuggle a duplicate through.
  const collection = song.album ? cleanSongText(song.album) : "";
  if (!collection) return artist;

  const key = normalizeSearchText(collection);
  const redundant =
    key === normalizeSearchText(song.title) || key === normalizeSearchText(artist);

  return redundant ? artist : `${artist} · ${collection}`;
}

/// `songSubtitle` with the release year appended, for the reveal surfaces where
/// the round is over and the year is one more thing worth knowing.
export function songSubtitleWithYear(
  song: SongLabelParts & { releaseYear?: number | null },
): string {
  return [songSubtitle(song), song.releaseYear].filter(Boolean).join(" · ");
}

import "server-only";

/// Hints for a PENDING round.
///
/// This has to run on the SERVER. The client no longer holds the target song —
/// that is the whole point of docs/game-engine.md authority #1 — so a hint
/// computed in the browser would mean shipping the answer to compute a clue
/// about it.
///
/// Each tier is gated on attempts already spent, so nothing is derivable before
/// it has been paid for.

export type RoundHint = {
  /// e.g. "1990s". Null when the catalog entry has no release year.
  decade: string | null;
  /// First genre on the song, if any.
  genre: string | null;
  /// Uppercased first character of the title. Only past ATTEMPTS_FOR_LETTER.
  firstLetter: string | null;
};

/// Nothing for the first two attempts — an instant hint would undercut the
/// 200ms stage, which is where the scoring is front-loaded.
const ATTEMPTS_FOR_DECADE_GENRE = 2;
const ATTEMPTS_FOR_LETTER = 4;

export type HintSource = {
  title: string;
  releaseYear: number | null;
  decade: number | null;
  genres: string[];
};

/// Returns null while the round hasn't earned a hint yet, so the caller can send
/// `hint: null` rather than an object of nulls the UI has to probe.
export function deriveHint(song: HintSource, attemptsUsed: number): RoundHint | null {
  if (attemptsUsed < ATTEMPTS_FOR_DECADE_GENRE) return null;

  // Song.decade is denormalised at ingest but nullable; fall back to the year.
  const decadeStart =
    song.decade ?? (song.releaseYear !== null ? Math.floor(song.releaseYear / 10) * 10 : null);

  return {
    decade: decadeStart !== null ? `${decadeStart}s` : null,
    genre: song.genres[0] ?? null,
    firstLetter:
      attemptsUsed >= ATTEMPTS_FOR_LETTER ? (song.title[0]?.toUpperCase() ?? null) : null,
  };
}

/// Prisma select for the fields deriveHint needs. Kept next to the function so
/// adding a hint tier can't silently miss a column at a call site.
export const hintSelect = {
  title: true,
  releaseYear: true,
  decade: true,
  genres: true,
} as const;

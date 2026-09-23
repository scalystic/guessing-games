/// The text a player shares from the result panel — the Wordle-style grid.
///
/// Pure string building, no DOM, so the format can be reasoned about (and
/// changed) in one place. Two rules shape it:
///
///   - Spoiler-free. The song title never appears: the grid is meant to land
///     in a group chat as a challenge, and naming the track spends the one
///     thing that makes a friend tap the link.
///   - The link is in the text itself, not only in a share-sheet `url` field.
///     WhatsApp, Telegram and the clipboard all keep the text, but several
///     share targets silently drop a separate url — and a grid with no link
///     brings nobody back.

import { absoluteUrl, SARGAM_PAGE } from "@/lib/site";

export type ShareGuess = { correct: boolean; skipped: boolean };
export type ShareRound = { solved: boolean; attemptsUsed: number };

/// One square per attempt slot in the current round, like a Wordle row.
const SQUARE = {
  correct: "🟩",
  wrong: "🟥",
  skipped: "⬛",
  unused: "⬜",
} as const;

/// Where shared links send people. utm_* so Search Console / analytics can
/// tell share traffic from search traffic; the page's rel=canonical already
/// points at the bare URL, so the parameters can't split its ranking.
export function shareUrl(source: "round" | "run"): string {
  const url = new URL(absoluteUrl(SARGAM_PAGE.path));
  url.searchParams.set("utm_source", "share");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", `result_${source}`);
  return url.toString();
}

/// "0.4s", "2.2s", "15s".
function clipLabel(ms: number): string {
  const seconds = Number((ms / 1000).toFixed(1));
  return `${seconds}s`;
}

/// The attempt row for one round: what each used slot was, then the slots
/// left unused. A give-up leaves no guess record, so its remaining slots stay
/// ⬜ — the headline already says the song got away.
export function roundRow(guesses: readonly ShareGuess[], maxAttempts: number): string {
  const used = guesses
    .slice(0, maxAttempts)
    .map((guess) => (guess.correct ? SQUARE.correct : guess.skipped ? SQUARE.skipped : SQUARE.wrong));
  const unused = Array.from({ length: Math.max(0, maxAttempts - used.length) }, () => SQUARE.unused);
  return [...used, ...unused].join("");
}

/// One square per song in the run, coloured by how early it was named. Scales
/// to a long practice run where a row per song would not.
function runSquare(round: ShareRound, maxAttempts: number): string {
  if (!round.solved) return SQUARE.wrong;
  if (round.attemptsUsed <= 1) return SQUARE.correct;
  // The first half of the ladder is still a fast guess; past that, it took
  // most of the clip.
  return round.attemptsUsed <= Math.ceil(maxAttempts / 2) ? "🟨" : "🟧";
}

/// Songs per line in the run grid — short enough that a phone chat bubble
/// doesn't wrap it mid-row.
const RUN_GRID_WIDTH = 5;
/// A very long run would turn the message into a wall; past this, the grid
/// shows the latest songs and the headline still counts all of them.
const RUN_GRID_MAX = 20;

export function runGrid(rounds: readonly ShareRound[], maxAttempts: number): string {
  const squares = rounds.slice(-RUN_GRID_MAX).map((round) => runSquare(round, maxAttempts));
  const lines: string[] = [];
  for (let index = 0; index < squares.length; index += RUN_GRID_WIDTH) {
    lines.push(squares.slice(index, index + RUN_GRID_WIDTH).join(""));
  }
  return lines.join("\n");
}

export type ShareInput = {
  /// This round.
  solved: boolean;
  attemptsUsed: number;
  maxAttempts: number;
  /// Clip length heard when the song was named.
  revealMs: number;
  guesses: readonly ShareGuess[];
  /// This run's resolved rounds, oldest first, including this one.
  runRounds: readonly ShareRound[];
  streak: number;
};

export function buildShareText(input: ShareInput): string {
  const { solved, attemptsUsed, maxAttempts, revealMs, guesses, runRounds, streak } = input;

  const headline = solved
    ? `🎵 Sargam: I guessed the song in ${clipLabel(revealMs)} (${Math.max(1, attemptsUsed)}/${maxAttempts})`
    : `🎵 Sargam: this one got away (X/${maxAttempts})`;

  const parts = [`${headline}\n${roundRow(guesses, maxAttempts)}`];

  // A run of one is the row above again; only worth a grid from two songs on.
  if (runRounds.length > 1) {
    const solvedCount = runRounds.filter((round) => round.solved).length;
    const streakLabel = streak > 1 ? ` · 🔥 ${streak} in a row` : "";
    parts.push(`This run: ${solvedCount}/${runRounds.length} songs${streakLabel}\n${runGrid(runRounds, maxAttempts)}`);
  }

  parts.push(`Can you beat it? ${shareUrl(runRounds.length > 1 ? "run" : "round")}`);
  return parts.join("\n\n");
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { PendingAction } from "@/hooks/useMelodleGame";
import { searchCatalog, type CatalogMatch } from "@/lib/api/runs";

/// Typeahead over the catalog, backed by GET /api/games/[slug]/search.
///
/// The endpoint is catalog-wide and has no idea which round is live, so what
/// comes back leaks nothing about the answer — that is exactly why it can hand
/// out real puzzleIds for the guess to reference.

type Props = {
  gameSlug: string;
  disabled?: boolean;
  pendingAction: PendingAction;
  nextRevealMs: number | null;
  /// Puzzles already guessed at this round. Filtered client-side; the endpoint
  /// deliberately doesn't know about the round.
  excludePuzzleIds: Set<string>;
  onGuess: (match: CatalogMatch) => void;
  onSkip: () => void;
};

/// Long enough that a fast typist doesn't fire a query per keystroke, short
/// enough that the list feels like it's keeping up.
const DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 2;

export function GuessAutocomplete({
  gameSlug,
  disabled,
  pendingAction,
  nextRevealMs,
  excludePuzzleIds,
  onGuess,
  onSkip,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  /// The last completed lookup, tagged with the query it answered. Storing the
  /// query alongside the matches is what lets "are we still searching?" be
  /// derived rather than tracked: if the tag doesn't match what's in the box,
  /// the answer on screen is for an older query.
  const [fetched, setFetched] = useState<{ query: string; matches: CatalogMatch[] } | null>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY_LENGTH;

  // Debounced search. The AbortController matters as much as the timer: without
  // it a slow early response can land after a fast later one and repopulate the
  // list with results for a query the player has already typed past.
  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      searchCatalog(gameSlug, trimmed, { signal: controller.signal })
        .then((matches) => setFetched({ query: trimmed, matches }))
        .catch(() => {
          if (controller.signal.aborted) return;
          // A failed lookup shows an empty list rather than an error — the
          // player can retype, and Skip is still right there. Tagged with the
          // query so it reads as "answered, nothing found" and not "still
          // searching".
          setFetched({ query: trimmed, matches: [] });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [gameSlug, trimmed, active]);

  const answered = active && fetched?.query === trimmed;
  const searching = active && !answered;
  const visible = answered
    ? fetched.matches.filter((match) => !excludePuzzleIds.has(match.puzzleId))
    : [];

  // Re-point the highlight at the top row whenever the query changes — adjusted
  // during render, React's documented alternative to a post-commit effect for
  // state that mirrors a changed value.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    if (activeIndex !== 0) setActiveIndex(0);
  }

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(match: CatalogMatch) {
    onGuess(match);
    setQuery("");
    setFetched(null);
    setOpen(false);
  }

  /// Submit the highlighted row, or resolve the query first if the debounced
  /// lookup hasn't landed yet.
  ///
  /// That second case is the whole reason this isn't inline: typing a full title
  /// and hitting Enter immediately is completely normal, and it arrives BEFORE
  /// the 180ms debounce fires. Dropping the keypress there means the player
  /// presses Enter, nothing happens, and the only clue is that the dropdown
  /// filled in a moment later.
  async function submitHighlighted() {
    const highlighted = visible[activeIndex] ?? visible[0];
    if (highlighted) {
      pick(highlighted);
      return;
    }

    if (!active || answered) return;

    try {
      const matches = await searchCatalog(gameSlug, trimmed);
      const first = matches.filter((match) => !excludePuzzleIds.has(match.puzzleId))[0];
      if (first) pick(first);
      // Nothing matched. Publish the (empty) answer so the dropdown stops
      // saying "Searching…" and says so instead.
      else setFetched({ query: trimmed, matches });
    } catch {
      // Same as the debounced path: leave the box alone and let them retype.
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitHighlighted();
      return;
    }
    if (!open || visible.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && active;
  const nextSeconds = nextRevealMs === null ? null : nextRevealMs / 1000;
  const pendingCopy =
    pendingAction === "guess"
      ? "Checking your answer…"
      : pendingAction === "skip"
        ? `Unlocking ${nextSeconds ?? "the next"} second${nextSeconds === 1 ? "" : "s"}…`
        : null;

  return (
    <section ref={rootRef} className="relative w-full" aria-labelledby="your-guess-label">
      <label
        id="your-guess-label"
        htmlFor="song-guess"
        className="mb-2 block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)"
      >
        Your guess
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-faint)"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            aria-hidden="true"
          >
            <circle cx="8.5" cy="8.5" r="6" />
            <path d="M13 13l4.5 4.5" strokeLinecap="round" />
          </svg>
          <input
            id="song-guess"
            value={query}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={pendingCopy ?? (disabled ? "Preparing the round…" : "Song title or artist")}
            className="h-12 w-full rounded-[7px] border border-(--hairline) bg-(--surface) pr-4 pl-10 text-base text-(--text) placeholder:text-(--text-faint) transition-colors duration-200 focus:border-(--signal) focus:bg-(--surface-strong) disabled:cursor-wait disabled:opacity-70"
          />
          {showDropdown && (
            <ul className="absolute bottom-full z-20 mb-2 max-h-72 w-full overflow-auto rounded-[8px] border border-(--hairline) bg-(--surface-strong) p-1.5 shadow-2xl shadow-black/25">
              {visible.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-(--text-faint)">
                  {searching ? "Searching…" : "No match in the catalog."}
                </li>
              )}
              {visible.map((match, i) => (
                <li key={match.puzzleId}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(match)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className="flex w-full items-center gap-3 rounded-[5px] px-3 py-2.5 text-left transition-colors duration-150"
                    style={{
                      background: i === activeIndex ? "var(--surface-hover)" : "transparent",
                    }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-(--hairline) font-mono text-[10px] text-(--text-faint)">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-(--text)">
                        {match.title}
                      </span>
                      <span className="block truncate text-xs text-(--text-dim)">
                        {match.artist}
                        {match.album ? ` · ${match.album}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={onSkip}
            className="min-h-12 rounded-[7px] border border-(--hairline) bg-transparent px-4 text-sm font-semibold text-(--text-dim) transition-colors duration-200 enabled:hover:border-(--text-faint) enabled:hover:text-(--text) disabled:cursor-wait disabled:opacity-50"
          >
            {pendingAction === "skip"
              ? "Unlocking…"
              : nextSeconds === null
                ? "Skip"
                : `Skip → ${nextSeconds}s`}
          </button>
          <button
            type="button"
            disabled={disabled || !active}
            onClick={() => void submitHighlighted()}
            className="min-h-12 rounded-[7px] bg-(--signal) px-6 text-sm font-bold text-(--signal-ink) transition-colors duration-200 enabled:hover:bg-[#ffd071] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {pendingAction === "guess" ? "Checking…" : "Guess"}
          </button>
        </div>
      </div>
      <p className="mt-2 min-h-4 text-xs text-(--text-faint)" role="status" aria-live="polite">
        {pendingCopy ?? (active ? "Choose a catalog match before submitting." : "Type at least two characters.")}
      </p>
    </section>
  );
}

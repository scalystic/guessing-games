"use client";

import { useEffect, useRef, useState } from "react";
import { coverBackground } from "@/lib/cover";
import { searchCatalog, type CatalogMatch } from "@/lib/api/runs";

/// Typeahead over the catalog, backed by GET /api/games/[slug]/search.
///
/// The endpoint is catalog-wide and has no idea which round is live, so what
/// comes back leaks nothing about the answer — that is exactly why it can hand
/// out real puzzleIds for the guess to reference.

type Props = {
  gameSlug: string;
  disabled?: boolean;
  /// Puzzles already guessed at this round. Filtered client-side; the endpoint
  /// deliberately doesn't know about the round.
  excludePuzzleIds: Set<string>;
  accent: string;
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
  excludePuzzleIds,
  accent,
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

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-dim)"
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
            value={query}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Round over" : "Type a song or artist…"}
            className="w-full rounded-2xl border-2 bg-(--surface) py-3.5 pr-4 pl-10 text-sm text-(--text) placeholder:text-(--text-dim) outline-none backdrop-blur-sm transition focus:bg-(--surface-hover) disabled:opacity-40"
            style={{ borderColor: `${accent}55` }}
          />
          {showDropdown && (
            <ul className="absolute bottom-full z-20 mb-2 max-h-72 w-full overflow-auto rounded-2xl border border-(--hairline) bg-(--surface-strong) p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl dark:shadow-black/50">
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                    style={{
                      background: i === activeIndex ? "var(--surface-hover)" : "transparent",
                    }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white/90"
                      style={{ background: coverBackground(`${match.title} ${match.artist}`) }}
                    >
                      {match.title[0]}
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
        <button
          type="button"
          disabled={disabled}
          onClick={onSkip}
          className="shrink-0 rounded-2xl border-2 bg-(--surface) px-5 text-sm font-bold text-(--text) transition enabled:hover:scale-[1.03] enabled:hover:bg-(--surface-hover) enabled:active:scale-95 disabled:opacity-40"
          style={{ borderColor: `${accent}55` }}
        >
          Skip
        </button>
        <button
          type="button"
          disabled={disabled || !active}
          onClick={() => void submitHighlighted()}
          className="shrink-0 rounded-2xl px-5 text-sm font-semibold text-black transition enabled:hover:scale-[1.03] enabled:active:scale-95 disabled:opacity-30"
          style={{ background: accent }}
        >
          Guess
        </button>
      </div>
    </div>
  );
}

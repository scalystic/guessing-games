"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "@/data/songs";

type Props = {
  songs: Song[];
  disabled?: boolean;
  excludeIds: Set<string>;
  accent: string;
  onGuess: (song: Song) => void;
  onSkip: () => void;
};

function rank(song: Song, query: string) {
  const q = query.trim().toLowerCase();
  const title = song.title.toLowerCase();
  const artist = song.artist.toLowerCase();
  if (title.startsWith(q)) return 0;
  if (artist.startsWith(q)) return 1;
  if (title.includes(q)) return 2;
  return 3;
}

export function GuessAutocomplete({
  songs,
  disabled,
  excludeIds,
  accent,
  onGuess,
  onSkip,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return songs
      .filter((s) => !excludeIds.has(s.id))
      .filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q),
      )
      .sort((a, b) => rank(a, q) - rank(b, q))
      .slice(0, 6);
  }, [songs, query, excludeIds]);

  // Re-point the highlighted row to the top whenever the query changes —
  // adjusted during render (React's documented alternative to an effect for
  // state that mirrors a changed value) instead of a post-commit effect.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    if (activeIndex !== 0) setActiveIndex(0);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(song: Song) {
    onGuess(song);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === "Enter" && results.length === 1) pick(results[0]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

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
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Round over" : "Type a song or artist…"}
            className="w-full rounded-2xl border-2 bg-(--surface) py-3.5 pr-4 pl-10 text-sm text-(--text) placeholder:text-(--text-dim) outline-none backdrop-blur-sm transition focus:bg-(--surface-hover) disabled:opacity-40"
            style={{ borderColor: `${accent}55` }}
          />
          {open && results.length > 0 && (
            <ul className="absolute bottom-full z-20 mb-2 max-h-72 w-full overflow-auto rounded-2xl border border-(--hairline) bg-(--surface-strong) p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl dark:shadow-black/50">
              {results.map((song, i) => (
                <li key={song.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(song)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                    style={{
                      background: i === activeIndex ? "var(--surface-hover)" : "transparent",
                    }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white/90"
                      style={{
                        background: `linear-gradient(135deg, ${song.cover[0]}, ${song.cover[1]})`,
                      }}
                    >
                      {song.title[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-(--text)">
                        {song.title}
                      </span>
                      <span className="block truncate text-xs text-(--text-dim)">
                        {song.artist}
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
      </div>
    </div>
  );
}

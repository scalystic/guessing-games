"use client";

import { useState } from "react";
import type { RoundHistoryEntry } from "@/hooks/useMelodleGame";
import { CoverArt } from "@/components/CoverArt";

const COLLAPSED_COUNT = 3;

function timeAgo(at: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function RoundHistoryList({ entries, now }: { entries: RoundHistoryEntry[]; now: number }) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hasMore = entries.length > COLLAPSED_COUNT;

  return (
    <section className="flex flex-col gap-3 border-t border-(--hairline) pt-5" aria-labelledby="recent-tracks-label">
      <div className="flex items-center justify-between">
        <p id="recent-tracks-label" className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">
          Recent tracks
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-semibold text-(--text-dim) transition-colors duration-200 hover:text-(--text)"
          >
            {expanded ? "Show less" : `View all (${entries.length})`}
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {visible.map((entry, i) => (
          <li
            key={i}
            className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-(--hairline) py-3 last:border-0"
          >
            <span className="relative block h-10 w-10 shrink-0">
              <CoverArt
                title={entry.song.title}
                artist={entry.song.artist}
                album={entry.song.album}
                className="h-10 w-10 rounded-lg"
              />
              <span
                className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-(--bg)"
                style={{ background: entry.solved ? "var(--success)" : "var(--miss)" }}
                aria-hidden="true"
              >
                {entry.solved ? (
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2.5 6 4.5 8 9.5 3" />
                  </svg>
                ) : (
                  <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
                    <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
                  </svg>
                )}
              </span>
              <span className="sr-only">{entry.solved ? "Solved" : "Missed"}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-(--text)">
                {entry.song.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-(--text-faint)">
                {[entry.song.artist, entry.song.album].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="shrink-0 text-right text-xs text-(--text-faint)">
              <span className="block">
                {entry.attemptsUsed} attempt{entry.attemptsUsed === 1 ? "" : "s"}
              </span>
              <span className="block">{timeAgo(entry.at, now)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { useState } from "react";
import type { RoundHistoryEntry } from "@/hooks/useMelodleGame";

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
            className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-(--hairline) py-3 last:border-0"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] font-bold"
              style={{
                borderColor: entry.solved ? "var(--success)" : "var(--miss)",
                color: entry.solved ? "var(--success)" : "var(--miss)",
              }}
            >
              {entry.solved ? "OK" : "MISS"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-(--text)">
                {entry.song.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-(--text-faint)">{entry.song.artist}</span>
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

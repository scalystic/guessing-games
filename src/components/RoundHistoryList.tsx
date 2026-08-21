"use client";

import { useState } from "react";
import type { RoundHistoryEntry } from "@/hooks/useMelodleGame";
import { coverBackground } from "@/lib/cover";

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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-(--text)">
          <span aria-hidden="true">🕐</span>
          Previous Guesses
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-medium text-(--text-dim) transition hover:text-(--text)"
          >
            {expanded ? "Show less" : `View all (${entries.length})`}
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {visible.map((entry, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2.5"
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                background: entry.solved ? "rgba(107,163,133,0.18)" : "rgba(193,122,107,0.18)",
                color: entry.solved ? "#6ba385" : "#c17a6b",
              }}
            >
              {entry.solved ? "✓" : "✕"}
            </span>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white/90"
              style={{ background: coverBackground(`${entry.song.title} ${entry.song.artist}`) }}
            >
              {entry.song.title[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-(--text)">
                {entry.song.title}
              </span>
              <span className="block truncate text-xs text-(--text-faint)">{entry.song.artist}</span>
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
    </div>
  );
}

"use client";

import { useMemo } from "react";

// Static sample opponents — there's no backend or accounts yet, so these
// can't be real players. Kept fixed (not random) so the board doesn't
// reshuffle on every render; your own row uses your actual session score.
const SAMPLE_ENTRIES = [
  { name: "Aisha Khan", score: 9200 },
  { name: "Rohan Mehta", score: 8400 },
  { name: "Priya Sharma", score: 7600 },
  { name: "Karan Verma", score: 6100 },
  { name: "Neha Gupta", score: 5300 },
  { name: "Vikram Rao", score: 4200 },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ score, accent }: { score: number; accent: string }) {
  const ranked = useMemo(() => {
    const rows = [...SAMPLE_ENTRIES, { name: "You", score, isYou: true }];
    return rows.sort((a, b) => b.score - a.score);
  }, [score]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-(--text-faint)">
        Static preview with your real session score — live rankings across everyone playing need
        accounts and a backend, which come later.
      </p>
      <ul className="flex flex-col gap-2">
        {ranked.map((entry, i) => {
          const isYou = "isYou" in entry && entry.isYou;
          return (
            <li
              key={entry.name}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{
                border: isYou ? `1px solid ${accent}55` : "1px solid var(--hairline)",
                background: isYou ? `${accent}14` : "var(--surface)",
              }}
            >
              <span className="w-6 shrink-0 text-center text-sm font-bold text-(--text-faint)">
                {MEDALS[i] ?? `#${i + 1}`}
              </span>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: isYou ? accent : "var(--surface-hover)",
                  color: isYou ? "#000" : "var(--text-dim)",
                }}
              >
                {entry.name[0]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-(--text)">
                {entry.name}
              </span>
              <span className="shrink-0 text-sm font-bold text-(--text)">
                {entry.score.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type Entry = {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  isYou: boolean;
};

type LeaderboardData = {
  entries: Entry[];
  you: { rank: number; score: number } | null;
};

const MEDALS = ["🥇", "🥈", "🥉"];

/// `dayKey` scopes the board to one day of the DAILY rotation (see
/// LeaderboardEntry in schema.prisma). Backed by GET
/// /api/daily-challenge/leaderboard, which reads rows completeRun() upserts
/// in src/lib/game/attempt.ts — there's nothing to poll here mid-run, only
/// after this player's own run has completed.
export function Leaderboard({ dayKey, accent }: { dayKey: string; accent: string }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    fetch(`/api/daily-challenge/leaderboard?dayKey=${encodeURIComponent(dayKey)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.data) setData(json.data);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dayKey]);

  if (failed) {
    return (
      <p className="py-6 text-center text-sm text-(--text-faint)">
        Couldn&apos;t load today&apos;s leaderboard.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-(--surface)" />
        ))}
      </div>
    );
  }

  const { entries, you } = data;
  // Only shown separately when the viewer's rank fell outside the loaded page.
  const showOwnRowBelow = you !== null && !entries.some((e) => e.isYou);

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-(--text-faint)">
        No one has finished today&apos;s challenge yet — be the first on the board.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <LeaderboardRow key={entry.playerId} entry={entry} accent={accent} />
        ))}
      </ul>
      {showOwnRowBelow && you && (
        <>
          <div className="my-1 border-t border-dashed border-(--hairline)" />
          <ul>
            <LeaderboardRow
              entry={{ rank: you.rank, playerId: "you", displayName: "You", score: you.score, isYou: true }}
              accent={accent}
            />
          </ul>
        </>
      )}
    </div>
  );
}

function LeaderboardRow({ entry, accent }: { entry: Entry; accent: string }) {
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        border: entry.isYou
          ? `1px solid color-mix(in srgb, ${accent} 33%, transparent)`
          : "1px solid var(--hairline)",
        background: entry.isYou
          ? `color-mix(in srgb, ${accent} 14%, transparent)`
          : "var(--surface)",
      }}
    >
      <span className="w-6 shrink-0 text-center text-sm font-bold text-(--text-faint)">
        {MEDALS[entry.rank - 1] ?? `#${entry.rank}`}
      </span>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: entry.isYou ? accent : "var(--surface-hover)",
          color: entry.isYou ? "#000" : "var(--text-dim)",
        }}
      >
        {(entry.isYou ? "Y" : entry.displayName)[0]?.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-(--text)">
        {entry.isYou ? "You" : entry.displayName}
      </span>
      <span className="shrink-0 text-sm font-bold text-(--text)">
        {entry.score.toLocaleString()}
      </span>
    </li>
  );
}

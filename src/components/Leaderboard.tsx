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
  you: { rank: number; score: number; displayName: string | null } | null;
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
              entry={{
                rank: you.rank,
                playerId: "you",
                // Same fallback the board route applies to every other row, so
                // an unnamed player reads "Player (You)" here and "Player"
                // to everyone else — not two different labels for one person.
                displayName: you.displayName ?? "Player",
                score: you.score,
                isYou: true,
              }}
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
      {/* Initial of the name, for your own row too. It used to be a hardcoded
          "Y" to match a hardcoded "You" — so a player who had just set a name
          saw neither their initial nor their name anywhere on the board. */}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: entry.isYou ? accent : "var(--surface-hover)",
          color: entry.isYou ? "#000" : "var(--text-dim)",
        }}
      >
        {entry.displayName[0]?.toUpperCase()}
      </span>
      {/* "<name> (You)", not "You": the row is already tinted and outlined in
          the accent, so it does not need the label to identify itself — and
          replacing the name with "You" hid the one thing a player looks for
          after setting it. The marker stays a separate muted span so the name
          truncates on its own when it's long. */}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-sm font-medium text-(--text)">
          {entry.displayName}
        </span>
        {entry.isYou ? (
          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-(--text-faint)">
            (You)
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-sm font-bold text-(--text)">
        {entry.score.toLocaleString()}
      </span>
    </li>
  );
}

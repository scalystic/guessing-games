"use client";

import { useEffect, useState } from "react";

type Entry = {
  rank: number;
  playerId: string;
  displayName: string;
  roundsPlayed: number;
  roundsSolved: number;
  instantSolveCount: number;
  isYou: boolean;
};

type LeaderboardData = {
  total: number;
  entries: Entry[];
  you: {
    rank: number;
    roundsPlayed: number;
    roundsSolved: number;
    instantSolveCount: number;
    displayName: string | null;
  } | null;
};

const MEDALS = ["🥇", "🥈", "🥉"];
const ROW_GRID = "grid grid-cols-[2rem_1fr_4.5rem_4.5rem_4.5rem] items-center gap-2";

/// The all-time board: every player who has finished at least one run,
/// ranked by first-attempt ("0.4 second") solves — see the note on
/// /api/leaderboard/stats for why that's the definition. No pagination modal
/// like the daily board has; the whole thing is already one page, so `limit`
/// just caps how many rows load.
export function StatsLeaderboard({ gameSlug }: { gameSlug: string }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/leaderboard/stats?gameSlug=${encodeURIComponent(gameSlug)}&limit=50`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((json) => {
        if (json.data) setData(json.data);
        else setFailed(true);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [gameSlug]);

  if (failed) {
    return (
      <p className="py-6 text-center text-sm text-(--text-faint)">
        Couldn&apos;t load the leaderboard.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl bg-(--surface)" />
        ))}
      </div>
    );
  }

  if (data.entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-(--text-faint)">
        No one has finished a run yet — be the first on the board.
      </p>
    );
  }

  const viewerInPage = data.entries.some((entry) => entry.isYou);

  return (
    <div className="flex flex-col gap-3">
      <div className={`${ROW_GRID} px-3 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)`}>
        <span />
        <span>Player</span>
        <span className="text-right">Played</span>
        <span className="text-right">Solved</span>
        <span className="text-right text-(--signal)">0.4s</span>
      </div>

      <ul className="flex flex-col gap-2">
        {data.entries.map((entry) => (
          <StatsRow key={entry.playerId} entry={entry} />
        ))}
      </ul>

      {data.you && !viewerInPage ? (
        <>
          <div className="flex items-center gap-2 py-1" aria-hidden="true">
            <span className="h-px flex-1 border-t border-dashed border-(--hairline)" />
            <span className="text-[10px] tracking-[0.2em] text-(--text-faint)">•••</span>
            <span className="h-px flex-1 border-t border-dashed border-(--hairline)" />
          </div>
          <ul className="flex flex-col gap-2" aria-label="Your position on the leaderboard">
            <StatsRow
              entry={{
                rank: data.you.rank,
                playerId: "you",
                displayName: data.you.displayName ?? "Player",
                roundsPlayed: data.you.roundsPlayed,
                roundsSolved: data.you.roundsSolved,
                instantSolveCount: data.you.instantSolveCount,
                isYou: true,
              }}
            />
          </ul>
        </>
      ) : null}

      <p className="pt-1 text-center font-mono text-[10px] text-(--text-faint)">
        {data.total.toLocaleString("en-IN")} player{data.total === 1 ? "" : "s"} on the board
      </p>
    </div>
  );
}

function StatsRow({ entry }: { entry: Entry }) {
  return (
    <li
      className={`${ROW_GRID} rounded-xl px-3 py-2.5`}
      style={{
        border: entry.isYou
          ? "1px solid color-mix(in srgb, var(--signal) 33%, transparent)"
          : "1px solid var(--hairline)",
        background: entry.isYou
          ? "color-mix(in srgb, var(--signal) 14%, transparent)"
          : "var(--surface)",
      }}
    >
      <span className="text-center text-sm font-bold text-(--text-faint)">
        {MEDALS[entry.rank - 1] ?? `#${entry.rank}`}
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-sm font-medium text-(--text)">{entry.displayName}</span>
        {entry.isYou ? (
          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-(--text-faint)">
            (You)
          </span>
        ) : null}
      </span>
      <span className="text-right text-sm text-(--text-dim)">{entry.roundsPlayed.toLocaleString()}</span>
      <span className="text-right text-sm text-(--text-dim)">{entry.roundsSolved.toLocaleString()}</span>
      <span className="text-right text-sm font-bold text-(--signal)">
        {entry.instantSolveCount.toLocaleString()}
      </span>
    </li>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";

type Entry = {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  isYou: boolean;
};

type LeaderboardData = {
  total: number;
  entries: Entry[];
  nearby: Entry[];
  you: { rank: number; score: number; displayName: string | null } | null;
};

const MEDALS = ["🥇", "🥈", "🥉"];

async function fetchLeaderboardPage(
  dayKey: string,
  { limit = 10, offset = 0, signal }: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<LeaderboardData> {
  const params = new URLSearchParams({
    dayKey,
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(`/api/daily-challenge/leaderboard?${params}`, { signal });
  const json = await response.json();
  if (!response.ok || !json.data) throw new Error("Leaderboard request failed");
  return json.data;
}

/// `dayKey` scopes the board to one day of the DAILY rotation (see
/// LeaderboardEntry in schema.prisma). Backed by GET
/// /api/daily-challenge/leaderboard, which reads rows completeRun() upserts
/// in src/lib/game/attempt.ts — there's nothing to poll here mid-run, only
/// after this player's own run has completed.
export function Leaderboard({ dayKey, accent }: { dayKey: string; accent: string }) {
  const [result, setResult] = useState<{ dayKey: string; data: LeaderboardData } | null>(null);
  const [failedDayKey, setFailedDayKey] = useState<string | null>(null);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchLeaderboardPage(dayKey, { signal: controller.signal })
      .then((leaderboard) => {
        setResult({ dayKey, data: leaderboard });
        setFailedDayKey(null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailedDayKey(dayKey);
      });
    return () => {
      controller.abort();
    };
  }, [dayKey]);

  const data = result?.dayKey === dayKey ? result.data : null;
  const failed = failedDayKey === dayKey;

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

  const { entries, nearby = [], total, you } = data;
  const viewerIsInTopTen = entries.some((entry) => entry.isYou);
  const nearbyEntries = nearby.filter(
    (nearbyEntry) => !entries.some((entry) => entry.playerId === nearbyEntry.playerId),
  );
  // A defensive fallback keeps the viewer visible if an older cached API
  // response has `you` but not the new nearby window yet.
  const contextEntries = nearbyEntries.length > 0
    ? nearbyEntries
    : you !== null && !viewerIsInTopTen
      ? [{
          rank: you.rank,
          playerId: "you",
          displayName: you.displayName ?? "Player",
          score: you.score,
          isYou: true,
        }]
      : [];

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
      {contextEntries.length > 0 && (
        <>
          <div className="flex items-center gap-2 py-1" aria-hidden="true">
            <span className="h-px flex-1 border-t border-dashed border-(--hairline)" />
            <span className="text-[10px] tracking-[0.2em] text-(--text-faint)">•••</span>
            <span className="h-px flex-1 border-t border-dashed border-(--hairline)" />
          </div>
          <ul className="flex flex-col gap-2" aria-label="Your position on the leaderboard">
            {contextEntries.map((entry) => (
              <LeaderboardRow key={entry.playerId} entry={entry} accent={accent} />
            ))}
          </ul>
        </>
      )}
      {total > entries.length ? (
        <button
          type="button"
          onClick={() => setShowFullLeaderboard(true)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[7px] border border-(--hairline) bg-(--surface) px-4 py-2.5 text-sm font-bold text-(--text) transition-colors duration-200 hover:border-(--text-faint) hover:bg-(--surface-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--signal)"
        >
          View full leaderboard
          <span className="font-mono text-[11px] font-medium text-(--text-faint)">
            {total.toLocaleString("en-IN")}
          </span>
        </button>
      ) : null}
      {showFullLeaderboard ? (
        <FullLeaderboardModal
          dayKey={dayKey}
          accent={accent}
          onClose={() => setShowFullLeaderboard(false)}
        />
      ) : null}
    </div>
  );
}

function FullLeaderboardModal({
  dayKey,
  accent,
  onClose,
}: {
  dayKey: string;
  accent: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAllEntries() {
      try {
        const allEntries: Entry[] = [];
        let offset = 0;
        let total = Number.POSITIVE_INFINITY;

        while (offset < total) {
          const page = await fetchLeaderboardPage(dayKey, {
            limit: 100,
            offset,
            signal: controller.signal,
          });
          allEntries.push(...page.entries);
          total = page.total;
          if (page.entries.length === 0) break;
          offset += page.entries.length;
        }

        setEntries(allEntries);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      }
    }

    void loadAllEntries();
    return () => controller.abort();
  }, [dayKey]);

  return (
    <Modal title="Today’s leaderboard" onClose={onClose}>
      {failed ? (
        <p className="py-8 text-center text-sm text-(--text-faint)">
          Couldn&apos;t load the full leaderboard.
        </p>
      ) : entries === null ? (
        <div className="flex flex-col gap-2 py-1" aria-label="Loading full leaderboard">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-(--surface)" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2 pr-1" aria-label="Full leaderboard">
          {entries.map((entry) => (
            <LeaderboardRow key={entry.playerId} entry={entry} accent={accent} />
          ))}
        </ul>
      )}
    </Modal>
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

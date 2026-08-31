"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ChallengeModal } from "./challenge-modal";

type ChallengeSong = {
  roundIndex: number;
  puzzleId: string;
  title: string;
  artist: string;
};

type ChallengeStats = {
  totalRuns: number;
  completedRuns: number;
  avgScore: number;
};

export type Challenge = {
  id: string;
  title: string | null;
  dayKey: string;
  roundCount: number;
  rewardCoins: number;
  rewardXp: number;
  publishedAt: string | null;
  createdAt: string;
  songs: ChallengeSong[];
  stats: ChallengeStats;
};

function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ publishedAt }: { publishedAt: string | null }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        publishedAt
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      }`}
    >
      {publishedAt ? "Published" : "Draft"}
    </span>
  );
}

export function ChallengesList() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [modalState, setModalState] = useState<
    { open: false } | { open: true; challenge: Challenge | null }
  >({ open: false });
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    startLoad(async () => {
      setError(null);
      try {
        const res = await fetch("/api/admin/daily-challenges");
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error?.message ?? "Failed to load challenges.");
          return;
        }
        setChallenges(json.data.challenges);
      } catch {
        setError("Network error — could not load challenges.");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string, dayKey: string) {
    if (!confirm(`Delete challenge for ${formatDayKey(dayKey)}? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/daily-challenges/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        alert(json?.error?.message ?? "Failed to delete challenge.");
      } else {
        load();
      }
    } finally {
      setDeleting(null);
    }
  }

  async function handlePublishToggle(challenge: Challenge) {
    const newPublishedAt = challenge.publishedAt ? null : new Date().toISOString();
    try {
      const res = await fetch(`/api/admin/daily-challenges/${challenge.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishedAt: newPublishedAt }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json?.error?.message ?? "Failed to update status.");
      } else {
        load();
      }
    } catch {
      alert("Network error.");
    }
  }

  // const todayKey = new Date().toISOString().slice(0, 10);
  const todayKey = '2026-08-30';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-dim)">
          All Challenges
        </h2>
        <button
          type="button"
          onClick={() => setModalState({ open: true, challenge: null })}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          + Create Challenge
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-(--hairline) bg-(--surface-strong)">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--hairline) text-(--text-faint)">
            <tr>
              <th className="px-4 py-3 font-medium">Challenge</th>
              <th className="px-4 py-3 font-medium">Songs</th>
              <th className="px-4 py-3 font-medium">Players</th>
              <th className="px-4 py-3 font-medium">Completed</th>
              <th className="px-4 py-3 font-medium">Avg Score</th>
              <th className="px-4 py-3 font-medium">Rewards</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-(--text-faint)">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && challenges.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-(--text-faint)">
                  No daily challenges yet. Create one to get started.
                </td>
              </tr>
            )}
            {!isLoading &&
              challenges.map((c) => {
                const isToday = c.dayKey === todayKey;
                const completionRate =
                  c.stats.totalRuns > 0
                    ? Math.round((c.stats.completedRuns / c.stats.totalRuns) * 100)
                    : null;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-(--hairline) transition last:border-0 hover:bg-(--surface-hover) ${isToday ? "bg-violet-500/5" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-(--text)">
                          {c.title ?? <span className="italic text-(--text-faint)">(untitled)</span>}
                          {isToday && (
                            <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-400">
                              Today
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-(--text-dim)">{formatDayKey(c.dayKey)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-(--text-dim)">{c.roundCount}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${c.stats.totalRuns > 0 ? "text-(--text)" : "text-(--text-faint)"}`}>
                        {c.stats.totalRuns}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-(--text-dim)">
                      {completionRate !== null ? (
                        <span>
                          {c.stats.completedRuns}{" "}
                          <span className="text-xs text-(--text-faint)">({completionRate}%)</span>
                        </span>
                      ) : (
                        <span className="text-(--text-faint)">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-(--text-dim)">
                      {c.stats.avgScore > 0 ? (
                        c.stats.avgScore.toLocaleString()
                      ) : (
                        <span className="text-(--text-faint)">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {c.rewardCoins > 0 && (
                          <span className="text-xs text-amber-500">{c.rewardCoins} coins</span>
                        )}
                        {c.rewardXp > 0 && (
                          <span className="text-xs text-violet-400">{c.rewardXp} XP</span>
                        )}
                        {c.rewardCoins === 0 && c.rewardXp === 0 && (
                          <span className="text-xs text-(--text-faint)">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge publishedAt={c.publishedAt} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handlePublishToggle(c)}
                          title={c.publishedAt ? "Unpublish" : "Publish"}
                          className="rounded-lg border border-(--hairline) px-2.5 py-1 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
                        >
                          {c.publishedAt ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalState({ open: true, challenge: c })}
                          className="rounded-lg border border-(--hairline) px-2.5 py-1 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id, c.dayKey)}
                          disabled={deleting === c.id || c.stats.totalRuns > 0}
                          title={
                            c.stats.totalRuns > 0
                              ? "Cannot delete — players have played this"
                              : "Delete"
                          }
                          className="rounded-lg border border-(--hairline) px-2.5 py-1 text-xs font-medium text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {deleting === c.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {modalState.open && (
        <ChallengeModal
          challenge={modalState.challenge}
          onClose={() => setModalState({ open: false })}
          onSaved={() => {
            setModalState({ open: false });
            load();
          }}
        />
      )}
    </div>
  );
}

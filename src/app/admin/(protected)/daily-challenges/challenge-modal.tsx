"use client";

import { useRef, useState } from "react";
import type { Challenge } from "./challenges-list";

type SongResult = {
  puzzleId: string;
  title: string;
  artist: string;
  album: string | null;
  externalId: string | null;
};

type RoundSlot = {
  roundIndex: number;
  puzzleId: string | null;
  title: string | null;
  artist: string | null;
};

type Props = {
  challenge: Challenge | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
};

const DEFAULT_ROUNDS = 5;

export function ChallengeModal({ challenge, onClose, onSaved }: Props) {
  const isEdit = challenge !== null;

  const [title, setTitle] = useState(challenge?.title ?? "");
  const [dayKey, setDayKey] = useState(challenge?.dayKey ?? new Date().toISOString().slice(0, 10));
  const [rewardCoins, setRewardCoins] = useState(challenge?.rewardCoins ?? 0);
  const [rewardXp, setRewardXp] = useState(challenge?.rewardXp ?? 0);
  const [publishNow, setPublishNow] = useState(!!challenge?.publishedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rounds, setRounds] = useState<RoundSlot[]>(() => {
    if (challenge?.songs?.length) {
      return challenge.songs.map((s) => ({
        roundIndex: s.roundIndex,
        puzzleId: s.puzzleId,
        title: s.title,
        artist: s.artist,
      }));
    }
    return Array.from({ length: DEFAULT_ROUNDS }, (_, i) => ({
      roundIndex: i + 1,
      puzzleId: null,
      title: null,
      artist: null,
    }));
  });

  // Per-round search state
  const [searches, setSearches] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, SongResult[]>>({});
  const [searchOpen, setSearchOpen] = useState<Record<number, boolean>>({});
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function handleSearchChange(roundIndex: number, q: string) {
    setSearches((prev) => ({ ...prev, [roundIndex]: q }));
    clearTimeout(searchTimers.current[roundIndex]);
    if (q.length < 2) {
      setResults((prev) => ({ ...prev, [roundIndex]: [] }));
      setSearchOpen((prev) => ({ ...prev, [roundIndex]: false }));
      return;
    }
    searchTimers.current[roundIndex] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/songs/search?q=${encodeURIComponent(q)}&limit=8`);
        const json = await res.json();
        if (res.ok) {
          setResults((prev) => ({ ...prev, [roundIndex]: json.data ?? [] }));
          setSearchOpen((prev) => ({ ...prev, [roundIndex]: true }));
        }
      } catch {
        // ignore
      }
    }, 300);
  }

  function selectSong(roundIndex: number, song: SongResult) {
    setRounds((prev) =>
      prev.map((r) =>
        r.roundIndex === roundIndex
          ? { ...r, puzzleId: song.puzzleId, title: song.title, artist: song.artist }
          : r,
      ),
    );
    setSearches((prev) => ({ ...prev, [roundIndex]: "" }));
    setResults((prev) => ({ ...prev, [roundIndex]: [] }));
    setSearchOpen((prev) => ({ ...prev, [roundIndex]: false }));
  }

  function clearSong(roundIndex: number) {
    setRounds((prev) =>
      prev.map((r) =>
        r.roundIndex === roundIndex ? { ...r, puzzleId: null, title: null, artist: null } : r,
      ),
    );
  }

  function addRound() {
    const next = rounds.length + 1;
    setRounds((prev) => [...prev, { roundIndex: next, puzzleId: null, title: null, artist: null }]);
  }

  function removeLastRound() {
    if (rounds.length <= 1) return;
    setRounds((prev) => prev.slice(0, -1));
  }

  async function handleSave() {
    setError(null);

    const filled = rounds.filter((r) => r.puzzleId !== null);
    if (filled.length === 0) {
      setError("Add at least one song to the challenge.");
      return;
    }

    // Check all filled slots are contiguous from round 1
    const unfilledEarly = rounds.some(
      (r) =>
        r.puzzleId === null &&
        rounds.some((r2) => r2.roundIndex > r.roundIndex && r2.puzzleId !== null),
    );
    if (unfilledEarly) {
      setError("There are gaps in your song selection — fill all rounds before a gap.");
      return;
    }

    const songs = rounds
      .filter((r) => r.puzzleId !== null)
      .map((r) => ({ puzzleId: r.puzzleId!, roundIndex: r.roundIndex }));

    setSaving(true);
    try {
      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/admin/daily-challenges/${challenge.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || null,
            songs: challenge.stats.totalRuns > 0 ? undefined : songs,
            rewardCoins,
            rewardXp,
            publishedAt: publishNow
              ? (challenge.publishedAt ?? new Date().toISOString())
              : null,
          }),
        });
      } else {
        res = await fetch("/api/admin/daily-challenges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || undefined,
            dayKey,
            songs,
            rewardCoins,
            rewardXp,
            publishNow,
          }),
        });
      }

      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Failed to save challenge.");
        return;
      }
      onSaved();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const hasSongsFromPlayers = isEdit && challenge.stats.totalRuns > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-(--hairline) bg-(--surface-strong) shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-(--hairline) px-6 py-4">
          <h2 className="text-base font-semibold text-(--text)">
            {isEdit ? "Edit Challenge" : "Create Daily Challenge"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-(--text-faint) transition hover:bg-(--surface-hover) hover:text-(--text)"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            {/* Title */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-(--text-dim)">
                Title <span className="text-(--text-faint)">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekend Bollywood Special"
                maxLength={200}
                className="w-full rounded-lg border border-(--hairline) bg-(--surface) px-3.5 py-2 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            {/* Date + Rewards row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-(--text-dim)">Date</label>
                <input
                  type="date"
                  value={dayKey}
                  onChange={(e) => setDayKey(e.target.value)}
                  disabled={isEdit}
                  className="w-full rounded-lg border border-(--hairline) bg-(--surface) px-3.5 py-2 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-(--text-dim)">
                  Bonus Coins
                </label>
                <input
                  type="number"
                  value={rewardCoins}
                  onChange={(e) => setRewardCoins(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  max={10000}
                  className="w-full rounded-lg border border-(--hairline) bg-(--surface) px-3.5 py-2 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-(--text-dim)">
                  Bonus XP
                </label>
                <input
                  type="number"
                  value={rewardXp}
                  onChange={(e) => setRewardXp(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  max={10000}
                  className="w-full rounded-lg border border-(--hairline) bg-(--surface) px-3.5 py-2 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>

            {/* Songs */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-medium text-(--text-dim)">
                  Songs ({rounds.filter((r) => r.puzzleId).length}/{rounds.length} selected)
                </label>
                {hasSongsFromPlayers && (
                  <span className="text-xs text-amber-500">
                    Songs locked — players have already started this challenge
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {rounds.map((round) => (
                  <div key={round.roundIndex} className="relative">
                    <div className="flex items-center gap-2 rounded-xl border border-(--hairline) bg-(--surface) p-3">
                      <span className="w-16 shrink-0 text-xs font-medium text-(--text-faint)">
                        Round {round.roundIndex}
                      </span>
                      {round.puzzleId ? (
                        <div className="flex flex-1 items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-(--text)">{round.title}</p>
                            <p className="truncate text-xs text-(--text-dim)">{round.artist}</p>
                          </div>
                          {!hasSongsFromPlayers && (
                            <button
                              type="button"
                              onClick={() => clearSong(round.roundIndex)}
                              className="shrink-0 rounded-lg p-1 text-xs text-(--text-faint) transition hover:bg-(--surface-hover) hover:text-red-500"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={searches[round.roundIndex] ?? ""}
                            onChange={(e) => handleSearchChange(round.roundIndex, e.target.value)}
                            onFocus={() => {
                              if ((results[round.roundIndex] ?? []).length > 0)
                                setSearchOpen((prev) => ({ ...prev, [round.roundIndex]: true }));
                            }}
                            onBlur={() =>
                              setTimeout(
                                () =>
                                  setSearchOpen((prev) => ({
                                    ...prev,
                                    [round.roundIndex]: false,
                                  })),
                                150,
                              )
                            }
                            placeholder="Search songs…"
                            className="w-full rounded-lg border border-(--hairline) bg-(--surface-strong) px-3 py-1.5 text-sm text-(--text) outline-none focus:border-violet-500"
                          />
                          {searchOpen[round.roundIndex] &&
                            (results[round.roundIndex] ?? []).length > 0 && (
                              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-(--hairline) bg-(--surface-strong) shadow-xl">
                                {(results[round.roundIndex] ?? []).map((song) => (
                                  <button
                                    key={song.puzzleId}
                                    type="button"
                                    onMouseDown={() => selectSong(round.roundIndex, song)}
                                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-(--surface-hover)"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-(--text)">
                                        {song.title}
                                      </p>
                                      <p className="truncate text-xs text-(--text-dim)">
                                        {song.artist}
                                        {song.album ? ` · ${song.album}` : ""}
                                        {song.externalId ? " · YouTube" : ""}
                                      </p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!hasSongsFromPlayers && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={addRound}
                    disabled={rounds.length >= 30}
                    className="rounded-lg border border-(--hairline) px-3 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover) disabled:opacity-40"
                  >
                    + Add Round
                  </button>
                  {rounds.length > 1 && (
                    <button
                      type="button"
                      onClick={removeLastRound}
                      className="rounded-lg border border-(--hairline) px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/10"
                    >
                      − Remove Last
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Publish */}
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-violet-600"
              />
              <span className="text-sm text-(--text-dim)">
                {isEdit ? "Published (visible to players)" : "Publish immediately"}
              </span>
            </label>

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-(--hairline) px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DeleteSongButton } from "./delete-song-button";
import { AddSongModal } from "./add-song-modal";
import { ImportYoutubeModal } from "./import-youtube-modal";
import { CoverArt } from "@/components/CoverArt";

export type StatusFilter = "all" | "active" | "removed" | "missing-clip";
export type SortKey = "title" | "artist" | "popularity" | "newest";
export type SortDir = "asc" | "desc";

export type SongsQuery = {
  q: string;
  status: StatusFilter;
  sort: SortKey;
  dir: SortDir;
  page: number;
};

type SongRow = {
  puzzleId: string;
  title: string;
  artist: string;
  album: string | null;
  popularity: number;
  isBlocked: boolean;
  externalId: string | null;
  hookStartMs: number;
  hookStartAutoDetected: boolean;
  createdAt: string | null;
};

type Counts = { total: number; active: number; removed: number; missingClip: number };

const EMPTY_COUNTS: Counts = { total: 0, active: 0, removed: 0, missingClip: 0 };

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "In catalog" },
  { key: "removed", label: "Removed" },
  { key: "missing-clip", label: "Missing clip" },
];

function popularityTone(value: number) {
  if (value >= 70) return "bg-emerald-500";
  if (value >= 40) return "bg-amber-500";
  return "bg-zinc-400 dark:bg-zinc-600";
}

function buildHref(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `/admin/songs?${qs}` : "/admin/songs";
}

function SortHeader({
  label,
  sortKey,
  query,
}: {
  label: string;
  sortKey: SortKey;
  query: SongsQuery;
}) {
  const isActive = query.sort === sortKey;
  const nextDir: SortDir = isActive && query.dir === "asc" ? "desc" : "asc";
  const href = buildHref({ q: query.q, status: query.status, sort: sortKey, dir: nextDir });

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 transition hover:text-(--text) ${
        isActive ? "text-(--text)" : ""
      }`}
    >
      {label}
      <span className="text-[10px]">{isActive ? (query.dir === "asc" ? "▲" : "▼") : ""}</span>
    </Link>
  );
}

// Mini YouTube player that floats at the bottom of the screen.
function YouTubePlayer({
  song,
  onClose,
}: {
  song: SongRow;
  onClose: () => void;
}) {
  const startSec = Math.floor(song.hookStartMs / 1000);
  const src = `https://www.youtube.com/embed/${song.externalId}?start=${startSec}&autoplay=1&rel=0`;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-80 flex-col overflow-hidden rounded-2xl border border-(--hairline) bg-(--surface-strong) shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-(--text)">{song.title}</p>
          <p className="truncate text-xs text-(--text-dim)">{song.artist}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded-lg p-1.5 text-(--text-faint) transition hover:bg-(--surface-hover) hover:text-(--text)"
        >
          ✕
        </button>
      </div>
      <iframe
        src={src}
        allow="autoplay; encrypted-media"
        className="h-44 w-full border-0"
        title={song.title}
      />
    </div>
  );
}

export function SongsList({ initialQuery }: { initialQuery: SongsQuery }) {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [playingSong, setPlayingSong] = useState<SongRow | null>(null);
  const playingIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [detectingIds, setDetectingIds] = useState<Set<string>>(new Set());
  const [detectingAll, setDetectingAll] = useState(false);
  const [savingHookIds, setSavingHookIds] = useState<Set<string>>(new Set());
  const [hookInputValues, setHookInputValues] = useState<Record<string, string>>({});

  const { q, status, sort, dir, page } = initialQuery;

  const load = useCallback(() => {
    startLoad(async () => {
      setError(null);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (status !== "all") params.set("status", status);
        params.set("sort", sort);
        params.set("dir", dir);
        params.set("page", String(page));

        const response = await fetch(`/api/song?${params.toString()}`);
        const json = await response.json();

        if (!response.ok) {
          setError(json?.error?.message ?? "Couldn't load songs.");
          return;
        }
        setSongs(json.data.songs);
        setCounts(json.data.counts);
        setTotalPages(json.data.totalPages);
      } catch {
        setError("Couldn't load songs — network error.");
      }
    });
  }, [q, status, sort, dir, page]);

  useEffect(() => {
    load();
  }, [load]);

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }

  function handlePlay(song: SongRow) {
    const alreadyPlaying = playingIdRef.current === song.puzzleId;

    // Stop whatever is currently playing first.
    stopAudio();
    playingIdRef.current = null;
    setPlayingSong(null);

    if (alreadyPlaying) return; // toggle off

    playingIdRef.current = song.puzzleId;

    if (song.externalId) {
      // YouTube song — show the iframe player.
      setPlayingSong(song);
    } else {
      // Stored audio clip — play via the native Audio API.
      const audio = new Audio(`/api/admin/songs/${song.puzzleId}/audio`);
      audioRef.current = audio;
      audio.play().catch(() => {});
      setPlayingSong(song);

      audio.addEventListener('ended', () => {
        if (playingIdRef.current === song.puzzleId) {
          playingIdRef.current = null;
          audioRef.current = null;
          setPlayingSong(null);
        }
      }, { once: true });
    }
  }

  async function handleDetectHook(song: SongRow) {
    if (detectingIds.has(song.puzzleId)) return;
    setDetectingIds((prev) => new Set(prev).add(song.puzzleId));
    try {
      const res = await fetch(`/api/admin/songs/${song.puzzleId}/detect-hook`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setSongs((prev) =>
          prev.map((s) =>
            s.puzzleId === song.puzzleId
              ? { ...s, hookStartMs: json.data.hookStartMs, hookStartAutoDetected: true }
              : s,
          ),
        );
        setHookInputValues((prev) => {
          const next = { ...prev };
          delete next[song.puzzleId];
          return next;
        });
      } else {
        setError(json?.error?.message ?? 'Hook detection failed.');
      }
    } catch {
      setError('Hook detection failed — network error.');
    } finally {
      setDetectingIds((prev) => {
        const next = new Set(prev);
        next.delete(song.puzzleId);
        return next;
      });
    }
  }

  async function handleDetectAllHooks() {
    if (detectingAll) return;
    // Only process YouTube songs that haven't been auto-detected yet
    const pending = songs.filter((s) => s.externalId && !s.hookStartAutoDetected);
    if (pending.length === 0) return;
    setDetectingAll(true);
    setDetectingIds(new Set(pending.map((s) => s.puzzleId)));
    for (const song of pending) {
      try {
        const res = await fetch(`/api/admin/songs/${song.puzzleId}/detect-hook`, { method: 'POST' });
        const json = await res.json();
        if (res.ok) {
          setSongs((prev) =>
            prev.map((s) =>
              s.puzzleId === song.puzzleId
                ? { ...s, hookStartMs: json.data.hookStartMs, hookStartAutoDetected: true }
                : s,
            ),
          );
        }
      } catch {
        // continue with remaining songs
      } finally {
        setDetectingIds((prev) => {
          const next = new Set(prev);
          next.delete(song.puzzleId);
          return next;
        });
      }
    }
    setDetectingAll(false);
  }

  async function saveHookStart(puzzleId: string, prevMs: number, newMs: number) {
    if (savingHookIds.has(puzzleId)) return;
    setSongs((prev) =>
      prev.map((s) => (s.puzzleId === puzzleId ? { ...s, hookStartMs: newMs } : s)),
    );
    setSavingHookIds((prev) => new Set(prev).add(puzzleId));
    try {
      const res = await fetch(`/api/admin/songs/${puzzleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hookStartMs: newMs }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json?.error?.message ?? 'Failed to save hook start.');
        setSongs((prev) =>
          prev.map((s) => (s.puzzleId === puzzleId ? { ...s, hookStartMs: prevMs } : s)),
        );
      }
    } catch {
      setError('Failed to save hook start — network error.');
      setSongs((prev) =>
        prev.map((s) => (s.puzzleId === puzzleId ? { ...s, hookStartMs: prevMs } : s)),
      );
    } finally {
      setSavingHookIds((prev) => {
        const next = new Set(prev);
        next.delete(puzzleId);
        return next;
      });
    }
  }

  function handleAdjustHook(song: SongRow, deltaMs: number) {
    const newMs = Math.max(0, song.hookStartMs + deltaMs);
    void saveHookStart(song.puzzleId, song.hookStartMs, newMs);
  }

  function handleHookInputChange(puzzleId: string, value: string) {
    setHookInputValues((prev) => ({ ...prev, [puzzleId]: value }));
  }

  function handleHookInputCommit(song: SongRow) {
    const raw = hookInputValues[song.puzzleId];
    setHookInputValues((prev) => {
      const next = { ...prev };
      delete next[song.puzzleId];
      return next;
    });
    if (raw === undefined) return;
    const seconds = parseFloat(raw);
    if (isNaN(seconds) || seconds < 0) return;
    const newMs = Math.round(seconds * 1000);
    if (newMs === song.hookStartMs) return;
    void saveHookStart(song.puzzleId, song.hookStartMs, newMs);
  }

  const statCards: { key: StatusFilter; label: string; value: number }[] = [
    { key: "all", label: "Total songs", value: counts.total },
    { key: "active", label: "In catalog", value: counts.active },
    { key: "removed", label: "Removed", value: counts.removed },
    { key: "missing-clip", label: "Missing clip", value: counts.missingClip },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end gap-3">
        <ImportYoutubeModal onImported={load} />
        <AddSongModal onCreated={load} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((card) => {
          const isActiveFilter = status === card.key;
          return (
            <Link
              key={card.key}
              href={buildHref({
                q,
                status: card.key === "all" ? undefined : card.key,
                sort,
                dir,
              })}
              className={`rounded-2xl border p-4 transition ${
                isActiveFilter
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-(--hairline) bg-(--surface-strong) hover:bg-(--surface-hover)"
              }`}
            >
              <p className="text-2xl font-bold text-(--text)">{card.value}</p>
              <p className="mt-1 text-xs text-(--text-dim)">{card.label}</p>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          {sort !== "title" && <input type="hidden" name="sort" value={sort} />}
          {dir !== "asc" && <input type="hidden" name="dir" value={dir} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by title or artist…"
            className="w-full max-w-sm rounded-lg border border-(--hairline) bg-(--surface-strong) px-3.5 py-2 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          />
          <button
            type="submit"
            className="rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          {/* Newest shortcut — active by default */}
          <Link
            href={buildHref({ q, status: status === "all" ? undefined : status, sort: "newest" })}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              sort === "newest"
                ? "border-violet-500 bg-violet-500/10 text-violet-500"
                : "border-(--hairline) text-(--text-dim) hover:bg-(--surface-hover)"
            }`}
          >
            Newest first
          </Link>

          <div className="flex gap-1 rounded-lg border border-(--hairline) bg-(--surface-strong) p-1">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={buildHref({ q, status: f.key === "all" ? undefined : f.key, sort, dir })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  status === f.key
                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                    : "text-(--text-dim) hover:bg-(--surface-hover)"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
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
              <th className="px-4 py-3 font-medium">
                <SortHeader label="Title" sortKey="title" query={initialQuery} />
              </th>
              <th className="px-4 py-3 font-medium">
                <SortHeader label="Artist" sortKey="artist" query={initialQuery} />
              </th>
              <th className="px-4 py-3 font-medium">
                <SortHeader label="Popularity" sortKey="popularity" query={initialQuery} />
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <span>hookStart</span>
                  <button
                    type="button"
                    onClick={handleDetectAllHooks}
                    disabled={detectingAll || songs.filter((s) => s.externalId && !s.hookStartAutoDetected).length === 0}
                    title="Auto-detect hook start for songs not yet detected"
                    className="rounded border border-(--hairline) px-2 py-0.5 text-[10px] font-medium text-(--text-faint) transition hover:border-amber-500 hover:text-amber-500 disabled:cursor-wait disabled:opacity-50"
                  >
                    {detectingAll ? "detecting…" : "Detect All"}
                  </button>
                </div>
              </th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-(--text-faint)">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              songs.map((song) => {
                const isPlaying = playingSong?.puzzleId === song.puzzleId;
                return (
                  <tr
                    key={song.puzzleId}
                    className="border-b border-(--hairline) transition last:border-0 hover:bg-(--surface-hover)"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CoverArt title={song.title} artist={song.artist} album={song.album} />
                        <span className="font-medium text-(--text)">{song.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-(--text-dim)">{song.artist}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-(--text-dim)">{song.popularity}</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-(--surface)">
                          <span
                            className={`block h-full rounded-full ${popularityTone(song.popularity)}`}
                            style={{ width: `${song.popularity}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          song.isBlocked
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {song.isBlocked ? "Removed" : "In catalog"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAdjustHook(song, -1000)}
                          disabled={savingHookIds.has(song.puzzleId) || song.hookStartMs <= 0}
                          title="Decrease hook start by 1s"
                          className="flex h-6 w-6 items-center justify-center rounded border border-(--hairline) text-xs text-(--text-faint) transition hover:border-violet-500 hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          disabled={savingHookIds.has(song.puzzleId)}
                          value={
                            hookInputValues[song.puzzleId] !== undefined
                              ? hookInputValues[song.puzzleId]
                              : (song.hookStartMs / 1000).toFixed(1)
                          }
                          onChange={(e) => handleHookInputChange(song.puzzleId, e.target.value)}
                          onBlur={() => handleHookInputCommit(song)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              setHookInputValues((prev) => {
                                const next = { ...prev };
                                delete next[song.puzzleId];
                                return next;
                              });
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-16 rounded border border-(--hairline) bg-(--surface) px-1.5 py-0.5 text-center text-xs font-medium text-(--text-dim) outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 disabled:cursor-wait disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleAdjustHook(song, 1000)}
                          disabled={savingHookIds.has(song.puzzleId)}
                          title="Increase hook start by 1s"
                          className="flex h-6 w-6 items-center justify-center rounded border border-(--hairline) text-xs text-(--text-faint) transition hover:border-violet-500 hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          +
                        </button>
                        {song.externalId && (
                          <button
                            type="button"
                            onClick={() => handleDetectHook(song)}
                            disabled={detectingIds.has(song.puzzleId)}
                            title="Auto-detect hook start"
                            className="ml-1 flex h-6 items-center justify-center rounded border border-(--hairline) px-1.5 text-[10px] font-medium text-(--text-faint) transition hover:border-amber-500 hover:text-amber-500 disabled:cursor-wait disabled:opacity-50"
                          >
                            {detectingIds.has(song.puzzleId) ? "…" : "⏱"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handlePlay(song)}
                          title={isPlaying ? "Stop" : song.externalId ? `Play from ${(song.hookStartMs / 1000).toFixed(1)}s (YouTube)` : "Play stored clip"}
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition ${
                            isPlaying
                              ? "bg-violet-600 text-white"
                              : "border border-(--hairline) text-(--text-faint) hover:border-violet-500 hover:text-violet-500"
                          }`}
                        >
                          {isPlaying ? "■" : "▶"}
                        </button>
                        <DeleteSongButton
                          puzzleId={song.puzzleId}
                          title={song.title}
                          onDeleted={load}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            {!isLoading && songs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-(--text-faint)">
                  No songs match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-(--text-faint)">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={buildHref({ q, status, sort, dir, page: page - 1 })}
              className="rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
            >
              Previous
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-faint) opacity-50">
              Previous
            </span>
          )}
          {page < totalPages ? (
            <Link
              href={buildHref({ q, status, sort, dir, page: page + 1 })}
              className="rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
            >
              Next
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-faint) opacity-50">
              Next
            </span>
          )}
        </div>
      </div>

      {playingSong?.externalId && (
        <YouTubePlayer
          song={playingSong}
          onClose={() => {
            stopAudio();
            playingIdRef.current = null;
            setPlayingSong(null);
          }}
        />
      )}
    </div>
  );
}

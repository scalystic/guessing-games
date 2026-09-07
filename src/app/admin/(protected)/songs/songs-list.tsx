"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { DeleteSongButton } from "./delete-song-button";
import { DraftSongButton } from "./draft-song-button";
import { AddSongModal } from "./add-song-modal";
import { ImportYoutubeModal } from "./import-youtube-modal";
import { SongReviewDrawer } from "./song-review-drawer";
import { CoverArt } from "@/components/CoverArt";
import { formatHookTime } from "@/components/admin/hook-audio";

/**
 * The catalog index, and the entry point to hook review.
 *
 * What this screen used to be, and why it changed: hook editing happened inline,
 * in a table cell, through a ±1s stepper and a floating YouTube VIDEO embed. A
 * 1000ms step cannot place a value that decides what the first 400ms of a round
 * sounds like, and the embed both played video nobody needed and could only seek
 * to within a couple of hundred milliseconds of the request. Editing now lives
 * in a drawer with a real waveform and sample-accurate audio (see
 * components/admin/AudioHookEditor.tsx); this table's job is to show the queue
 * and get you into it.
 */

export type StatusFilter = "all" | "locked" | "in-review" | "draft";
export type SortKey = "title" | "artist" | "popularity" | "newest";
export type SortDir = "asc" | "desc";

export type SongsQuery = {
  q: string;
  status: StatusFilter;
  sort: SortKey;
  dir: SortDir;
  page: number;
};

export type SongRow = {
  puzzleId: string;
  title: string;
  artist: string;
  album: string | null;
  movie: string | null;
  popularity: number;
  isActive: boolean;
  isBlocked: boolean;
  externalId: string | null;
  hookStartMs: number;
  hookStartAutoDetected: boolean;
  isLocked: boolean;
  lockedAt: string | null;
  createdAt: string | null;
};

type Counts = { total: number; locked: number; inReview: number; draft: number };

const EMPTY_COUNTS: Counts = { total: 0, locked: 0, inReview: 0, draft: 0 };

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "locked", label: "Locked" },
  { key: "in-review", label: "In review" },
  { key: "draft", label: "Drafts" },
];

/// Which stat card a row is counted under. The three are mutually exclusive and
/// drafting takes precedence over the lock, matching GET /api/song's
/// STATUS_WHERE — a drafted song is a draft whatever its lock says.
type CountBucket = "locked" | "inReview" | "draft";

function bucketOf(song: SongRow): CountBucket {
  if (song.isBlocked) return "draft";
  return song.isLocked ? "locked" : "inReview";
}

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

export function SongsList({ initialQuery }: { initialQuery: SongsQuery }) {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [ladder, setLadder] = useState<number[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  /// puzzleId of the song open in the review drawer. An id rather than the row,
  /// so an edit landing in `songs` is reflected in the open drawer instead of it
  /// holding a stale copy.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [detectingAll, setDetectingAll] = useState(false);
  const [detectProgress, setDetectProgress] = useState({ done: 0, total: 0 });

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
        setLadder(json.data.revealLadder ?? []);
        setTotalPages(json.data.totalPages);
      } catch {
        setError("Couldn't load songs — network error.");
      }
    });
  }, [q, status, sort, dir, page]);

  useEffect(() => {
    load();
  }, [load]);

  /// Patch one row in place. The drawer and the row buttons write one song at a
  /// time and a refetch would reshuffle the page under an open drawer — and, on
  /// a filtered tab, make the row you just locked or drafted vanish out from
  /// under you. The row keeps its place with an updated badge until the next
  /// real load.
  const applySongUpdate = useCallback(
    (updated: SongRow) => {
      const before = songs.find((s) => s.puzzleId === updated.puzzleId);
      // Every transition this screen makes (lock, unlock, draft, recover) moves
      // one song between exactly two of the three buckets, so the stat cards can
      // be adjusted by a delta instead of paying for a recount. `total` never
      // moves — nothing here creates or deletes a song.
      if (before) {
        const from = bucketOf(before);
        const to = bucketOf(updated);
        if (from !== to) {
          setCounts((prev) => ({ ...prev, [from]: prev[from] - 1, [to]: prev[to] + 1 }));
        }
      }
      setSongs((prev) => prev.map((s) => (s.puzzleId === updated.puzzleId ? updated : s)));
    },
    [songs],
  );

  async function handleDetectAllHooks() {
    if (detectingAll) return;
    // Only unlocked, undrafted YouTube songs that no detector has touched yet.
    // Locked ones are refused by the route anyway (a locked offset is
    // human-approved and a detector must not overwrite it), drafts aren't headed
    // for rotation, and re-running on already-detected songs just burns minutes
    // re-deriving the same numbers.
    const pending = songs.filter(
      (s) => s.externalId && !s.hookStartAutoDetected && !s.isLocked && !s.isBlocked,
    );
    if (pending.length === 0) return;

    setDetectingAll(true);
    setDetectProgress({ done: 0, total: pending.length });

    for (const [index, song] of pending.entries()) {
      try {
        const response = await fetch(`/api/admin/songs/${song.puzzleId}/detect-hook`, {
          method: "POST",
        });
        const json = await response.json();
        if (response.ok) {
          setSongs((prev) =>
            prev.map((s) =>
              s.puzzleId === song.puzzleId
                ? { ...s, hookStartMs: json.data.hookStartMs, hookStartAutoDetected: true }
                : s,
            ),
          );
        }
      } catch {
        // Keep going — one unreachable video shouldn't abandon the batch.
      } finally {
        setDetectProgress({ done: index + 1, total: pending.length });
      }
    }

    setDetectingAll(false);
  }

  const detectableCount = songs.filter(
    (s) => s.externalId && !s.hookStartAutoDetected && !s.isLocked && !s.isBlocked,
  ).length;

  const reviewing = songs.find((s) => s.puzzleId === reviewingId) ?? null;

  const statCards: { key: StatusFilter; label: string; value: number; hint: string }[] = [
    { key: "all", label: "Total songs", value: counts.total, hint: "in the catalog" },
    { key: "locked", label: "Locked", value: counts.locked, hint: "playable" },
    { key: "in-review", label: "In review", value: counts.inReview, hint: "not played yet" },
    { key: "draft", label: "Drafts", value: counts.draft, hint: "set aside, recoverable" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end gap-3">
        <ImportYoutubeModal onImported={load} />
        <AddSongModal onCreated={load} />
      </div>

      {counts.locked === 0 && counts.total > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-(--text-dim)">
          <span className="font-medium text-amber-600 dark:text-amber-400">
            No songs are locked.
          </span>{" "}
          Only locked songs are sampled into runs or offered by the guess typeahead, so the game has
          nothing to play until at least a few are reviewed and locked.
        </div>
      )}

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
              <p className="text-[10px] text-(--text-faint)">{card.hint}</p>
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
                  <span>Hook</span>
                  <button
                    type="button"
                    onClick={handleDetectAllHooks}
                    disabled={detectingAll || detectableCount === 0}
                    title="Run silence detection on every un-detected, unlocked, undrafted song on this page"
                    className="rounded border border-(--hairline) px-2 py-0.5 text-[10px] font-medium text-(--text-faint) transition hover:border-amber-500 hover:text-amber-500 disabled:cursor-wait disabled:opacity-50"
                  >
                    {detectingAll
                      ? `detecting ${detectProgress.done}/${detectProgress.total}…`
                      : `Detect ${detectableCount || ""}`.trim()}
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
              songs.map((song) => (
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
                    <PopularityCell song={song} onSaved={applySongUpdate} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {song.isBlocked ? (
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                          Draft
                        </span>
                      ) : song.isLocked ? (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          🔒 Locked
                        </span>
                      ) : (
                        <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">
                          In review
                        </span>
                      )}
                      {!song.externalId && (
                        <span className="text-[10px] text-amber-500">no video</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums text-(--text-dim)">
                        {formatHookTime(song.hookStartMs)}
                      </span>
                      {song.hookStartAutoDetected && (
                        <span
                          title="Set by the silence detector — not yet confirmed by ear"
                          className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-500"
                        >
                          auto
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewingId(song.puzzleId)}
                        disabled={!song.externalId}
                        title={
                          song.externalId
                            ? "Listen and set the hook start"
                            : "No YouTube video id — nothing to listen to"
                        }
                        className="rounded-md border border-violet-500/40 px-2.5 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-violet-400"
                      >
                        {song.isBlocked ? "Open ↗" : song.isLocked ? "Review ↗" : "Set hook ↗"}
                      </button>
                      <DraftSongButton song={song} onSaved={applySongUpdate} />
                      <DeleteSongButton
                        puzzleId={song.puzzleId}
                        title={song.title}
                        onDeleted={load}
                      />
                    </div>
                  </td>
                </tr>
              ))}
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

      {reviewing && (
        <SongReviewDrawer
          // Remount per song: the editor holds a decoded AudioBuffer and an
          // AudioContext, and unmounting is what tears those down. Reusing the
          // instance across songs would leak both.
          key={reviewing.puzzleId}
          song={reviewing}
          ladder={ladder}
          onClose={() => setReviewingId(null)}
          onSaved={applySongUpdate}
        />
      )}
    </div>
  );
}

/**
 * The Popularity column, editable in place.
 *
 * Popularity is normally telemetry's to move, but it decides which difficulty
 * band a puzzle is sampled into, and a mis-seeded number is obvious exactly
 * here — reading down the column against titles you recognise. So it is edited
 * here too, rather than through a round trip to the edit form, which owns
 * seedPopularity (the original signal) and not this.
 *
 * Committing needs a deliberate gesture — Enter or the ✓ — because this is a
 * bare number in a dense table and a blur-to-save would let a stray click
 * anywhere on the page write a half-typed value.
 */
function PopularityCell({
  song,
  onSaved,
}: {
  song: SongRow;
  onSaved: (song: SongRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(song.popularity));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(String(song.popularity));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setError("0–100");
      return;
    }
    if (value === song.popularity) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/songs/${song.puzzleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ popularity: value }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Couldn't save.");
        return;
      }
      onSaved({ ...song, popularity: json.data.popularity });
      setEditing(false);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        title="Click to retune popularity"
        className="group flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition hover:bg-(--surface)"
      >
        <span className="w-7 tabular-nums text-(--text-dim)">{song.popularity}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-(--surface)">
          <span
            className={`block h-full rounded-full ${popularityTone(song.popularity)}`}
            style={{ width: `${song.popularity}%` }}
          />
        </span>
        <span className="text-[10px] text-(--text-faint) opacity-0 transition group-hover:opacity-100">
          ✎
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        // Opened by an explicit click on this cell, so focus belongs in the
        // field that click opened.
        autoFocus
        type="number"
        min={0}
        max={100}
        step={1}
        value={draft}
        disabled={saving}
        aria-label={`Popularity for ${song.title}`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="w-16 rounded-md border border-violet-500 bg-(--surface) px-2 py-1 text-xs tabular-nums text-(--text) outline-none focus:ring-2 focus:ring-violet-500/20"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        title="Save popularity"
        className="rounded-md border border-emerald-500/40 px-1.5 py-1 text-xs text-emerald-600 transition hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-400"
      >
        {saving ? "…" : "✓"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        title="Cancel"
        className="rounded-md border border-(--hairline) px-1.5 py-1 text-xs text-(--text-faint) transition hover:bg-(--surface-hover) disabled:opacity-40"
      >
        ✕
      </button>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  );
}

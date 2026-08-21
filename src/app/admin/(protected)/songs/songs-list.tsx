"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { DeleteSongButton } from "./delete-song-button";
import { AddSongModal } from "./add-song-modal";

export type StatusFilter = "all" | "active" | "removed" | "missing-clip";
export type SortKey = "title" | "artist" | "popularity";
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
  popularity: number;
  isBlocked: boolean;
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

// page is deliberately omitted from every caller except the Previous/Next
// links below — leaving it out of a href means "page 1", so changing search,
// status, or sort always implicitly resets pagination instead of landing on
// a now out-of-range page.
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

/// Fetches from GET /api/song rather than being handed data from the server
/// component — the query (q/status/sort/dir/page) is parsed server-side in
/// page.tsx purely to drive this initial fetch and keep filter/sort/search/
/// pagination links working as plain URL navigation; the actual song rows
/// always come from the API, including immediately after an add/edit/delete.
export function SongsList({ initialQuery }: { initialQuery: SongsQuery }) {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();

  const { q, status, sort, dir, page } = initialQuery;

  // Wrapped in startTransition (not setLoading(true)/setError(null) called
  // straight from the effect body) so the pending-state updates are proper
  // React transitions rather than synchronous setState calls inside an
  // effect, which cascades an extra render.
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

  const statCards: { key: StatusFilter; label: string; value: number }[] = [
    { key: "all", label: "Total songs", value: counts.total },
    { key: "active", label: "In catalog", value: counts.active },
    { key: "removed", label: "Removed", value: counts.removed },
    { key: "missing-clip", label: "Missing clip", value: counts.missingClip },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
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
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-(--text-faint)">
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
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-sm">
                        🎵
                      </span>
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
                    <div className="flex items-center justify-end gap-2">
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
                <td colSpan={5} className="px-4 py-10 text-center text-(--text-faint)">
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
    </div>
  );
}

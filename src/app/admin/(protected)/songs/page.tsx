import { SongsList, type SongsQuery, type SortKey, type StatusFilter } from "./songs-list";

const STATUS_VALUES: StatusFilter[] = ["all", "active", "removed", "missing-clip"];
const SORT_VALUES: SortKey[] = ["title", "artist", "popularity", "newest"];

/// This page only resolves the initial query from the URL and hands off to
/// SongsList (a client component), which owns the actual data — fetched
/// from GET /api/song, including on first load. That keeps one source of
/// truth for "what songs exist" shared with the create/edit/delete/toggle
/// actions that hit the same API, rather than this page reading Postgres
/// directly through Prisma on its own.
export default async function SongsPage({
  searchParams,
}: PageProps<"/admin/songs">) {
  const sp = await searchParams;

  const pageNum = Number(sp.page);

  const query: SongsQuery = {
    q: typeof sp.q === "string" ? sp.q.trim() : "",
    status: STATUS_VALUES.includes(sp.status as StatusFilter)
      ? (sp.status as StatusFilter)
      : "all",
    sort: SORT_VALUES.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "newest",
    dir: sp.dir === "desc" ? "desc" : "asc",
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
          Manage Song
        </h1>
        <p className="mt-1 text-sm text-(--text-dim)">
          Add, edit, and remove songs from the catalog.
        </p>
      </div>

      <SongsList initialQuery={query} />
    </div>
  );
}

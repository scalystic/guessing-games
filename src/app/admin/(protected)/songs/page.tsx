import { SongsList, type SongsQuery, type StatusFilter } from "./songs-list";
import { SORT_KEYS, defaultDirFor, type SortDir, type SortKey } from "@/lib/admin/song-sort";

const STATUS_VALUES: StatusFilter[] = ["all", "locked", "in-review", "draft"];

/// ?status=removed is what the drafts tab was called before drafting became
/// reversible; GET /api/song accepts the same alias.
const STATUS_ALIASES: Record<string, StatusFilter | undefined> = { removed: "draft" };

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

  const sort: SortKey = SORT_KEYS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "newest";
  // A URL that names a sort but no direction gets that sort's natural one, so
  // the bare /admin/songs still opens on the most recent imports rather than
  // the oldest — see defaultDirFor.
  const dir: SortDir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : defaultDirFor(sort);

  const query: SongsQuery = {
    q: typeof sp.q === "string" ? sp.q.trim() : "",
    status: STATUS_VALUES.includes(sp.status as StatusFilter)
      ? (sp.status as StatusFilter)
      : (STATUS_ALIASES[String(sp.status)] ?? "all"),
    sort,
    dir,
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
          Manage songs
        </h1>
        <p className="mt-1 text-sm text-(--text-dim)">
          Review each song&apos;s hook start by ear, then lock it. Only locked songs are played.
          Don&apos;t want one in the list? Draft it — it leaves the queue and rotation, and can be
          recovered back into review at any time.
        </p>
      </div>

      <SongsList initialQuery={query} />
    </div>
  );
}

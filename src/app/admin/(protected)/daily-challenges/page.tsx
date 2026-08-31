import { prisma } from "@/lib/db";
import { ChallengesList } from "./challenges-list";

const DISPLAY_TZ = process.env.DAILY_TZ ?? "UTC";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: DISPLAY_TZ });
}

export default async function DailyChallengesPage() {
  const todayKey = new Date().toISOString().slice(0, 10);

  const [totalChallenges, todayChallenge, allTimeRuns, publishedCount] = await Promise.all([
    prisma.dailyChallenge.count(),
    prisma.dailyChallenge.findFirst({
      where: { dayKey: todayKey },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        _count: { select: { runs: true } },
      },
    }),
    prisma.run.count({ where: { mode: "DAILY", dailyChallengeId: { not: null } } }),
    prisma.dailyChallenge.count({ where: { publishedAt: { not: null } } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
          Daily Challenges
        </h1>
        <p className="mt-1 text-sm text-(--text-dim)">
          Configure daily song challenges. Players compete on a fixed set of songs each day.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-(--hairline) bg-(--surface-strong) p-5">
          <p className="text-3xl font-bold text-(--text)">{totalChallenges}</p>
          <p className="mt-1 text-sm text-(--text-dim)">Total challenges</p>
        </div>
        <div className="rounded-2xl border-l-4 border-l-emerald-500 border border-(--hairline) bg-(--surface-strong) p-5">
          <p className="text-3xl font-bold text-emerald-500">{publishedCount}</p>
          <p className="mt-1 text-sm text-(--text-dim)">Published</p>
          <p className="mt-1 text-xs text-(--text-faint)">{totalChallenges - publishedCount} drafts</p>
        </div>
        <div className="rounded-2xl border-l-4 border-l-blue-500 border border-(--hairline) bg-(--surface-strong) p-5">
          <p className="text-3xl font-bold text-blue-500">{allTimeRuns}</p>
          <p className="mt-1 text-sm text-(--text-dim)">All-time plays</p>
          <p className="mt-1 text-xs text-(--text-faint)">Across all challenges</p>
        </div>
        <div className="rounded-2xl border-l-4 border-l-violet-500 border border-(--hairline) bg-(--surface-strong) p-5">
          {todayChallenge ? (
            <>
              <p className="text-3xl font-bold text-violet-500">{todayChallenge._count.runs}</p>
              <p className="mt-1 text-sm text-(--text-dim)">Playing today</p>
              <p className="mt-1 text-xs text-(--text-faint)">
                {todayChallenge.title ?? formatDate(todayKey)} ·{" "}
                {todayChallenge.publishedAt ? "Published" : "Draft"}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-(--text-faint)">—</p>
              <p className="mt-1 text-sm text-(--text-dim)">No challenge today</p>
              <p className="mt-1 text-xs text-(--text-faint)">Create one below</p>
            </>
          )}
        </div>
      </div>

      <ChallengesList />
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/db";
import { DashboardCharts } from "@/components/admin/DashboardCharts";
import type { ActivityPoint, OutcomePoint, SongPlay } from "@/components/admin/DashboardCharts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(date: Date | null | undefined): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

const DISPLAY_TZ = process.env.DAILY_TZ ?? "UTC";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TZ,
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TZ,
  });
}

function fmtChartDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

function solveRate(solved: number, failed: number): string {
  const total = solved + failed;
  if (total === 0) return "—";
  return `${Math.round((solved / total) * 100)}%`;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Raw SQL result types
// ---------------------------------------------------------------------------

type RawDayCount = { day: string; count: number };
type RawDayOutcome = { day: string; outcome: string; count: number };
type RawTopSong = { title: string; artist: string; plays: number; solves: number };

// ---------------------------------------------------------------------------
// Chart data helpers
// ---------------------------------------------------------------------------

function buildDateRange(days: number): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function fillActivity(raw: RawDayCount[], days = 14): ActivityPoint[] {
  const map = new Map(raw.map((r) => [r.day.toString().slice(0, 10), Number(r.count)]));
  return buildDateRange(days).map((iso) => ({
    date: fmtChartDate(iso),
    runs: map.get(iso) ?? 0,
  }));
}

function fillOutcomes(raw: RawDayOutcome[], days = 14): OutcomePoint[] {
  const solvedMap = new Map<string, number>();
  const failedMap = new Map<string, number>();
  for (const r of raw) {
    const iso = r.day.toString().slice(0, 10);
    if (r.outcome === "SOLVED") solvedMap.set(iso, Number(r.count));
    if (r.outcome === "FAILED") failedMap.set(iso, Number(r.count));
  }
  return buildDateRange(days).map((iso) => ({
    date: fmtChartDate(iso),
    solved: solvedMap.get(iso) ?? 0,
    failed: failedMap.get(iso) ?? 0,
  }));
}

function buildTopSongs(raw: RawTopSong[]): SongPlay[] {
  return raw.map((r) => {
    const full = `${r.title} – ${r.artist}`;
    return {
      label: full.length > 32 ? full.slice(0, 30) + "…" : full,
      plays: Number(r.plays),
      solves: Number(r.solves),
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-components (server)
// ---------------------------------------------------------------------------

type CardProps = {
  value: number | string;
  label: string;
  sublabel?: string;
  href?: string;
  accent?: "default" | "green" | "red" | "blue" | "yellow" | "purple";
};

function StatCard({ value, label, sublabel, href, accent = "default" }: CardProps) {
  const accentClass =
    accent === "green"  ? "border-l-4 border-l-emerald-500"
    : accent === "red"  ? "border-l-4 border-l-red-500"
    : accent === "blue" ? "border-l-4 border-l-blue-500"
    : accent === "yellow" ? "border-l-4 border-l-amber-500"
    : accent === "purple" ? "border-l-4 border-l-violet-500"
    : "";

  const valueClass =
    accent === "green"  ? "text-emerald-500"
    : accent === "red"  ? "text-red-500"
    : accent === "blue" ? "text-blue-500"
    : accent === "purple" ? "text-violet-500"
    : "text-(--text)";

  const inner = (
    <div
      className={`h-full rounded-2xl border border-(--hairline) bg-(--surface-strong) p-5 transition ${accentClass} ${href ? "hover:bg-(--surface-hover)" : ""}`}
    >
      <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-sm text-(--text-dim)">{label}</p>
      {sublabel && <p className="mt-1 text-xs text-(--text-faint)">{sublabel}</p>}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>;
}

function Section({
  title,
  subtitle,
  live,
  children,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {live && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-dim)">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-(--text-faint)">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminDashboardPage() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const cutoff14 = new Date(now);
  cutoff14.setDate(cutoff14.getDate() - 13);
  cutoff14.setUTCHours(0, 0, 0, 0);

  // All queries in one parallel batch
  const [
    // Catalog
    totalSongs,
    activeSongs,
    blockedSongs,
    songsMissingClip,

    // Users
    totalUsers,

    // YouTube
    youtubeSongCount,
    youtubeSongsToday,
    lastYoutubeImport,
    recentYoutubeImports,

    // Today's activity
    visitorsToday,
    runsToday,
    roundsSolvedToday,
    roundsFailedToday,

    // All-time guess stats
    totalGuesses,
    totalSkips,
    totalCorrect,

    // Chart data
    rawDailyRuns,
    rawDailyOutcomes,
    rawTopSongs,

    // Daily Challenges
    totalChallenges,
    publishedChallenges,
    todayDailyChallengeRuns,
    allTimeDailyChallengeRuns,
  ] = await Promise.all([
    // ── Catalog ──
    prisma.song.count(),
    prisma.puzzle.count({ where: { isBlocked: false } }),
    prisma.puzzle.count({ where: { isBlocked: true } }),
    prisma.puzzle.count({ where: { assets: { none: { kind: "AUDIO_CLIP" } } } }),

    // ── Users ──
    prisma.player.count({ where: { kind: "USER" } }),

    // ── YouTube ──
    prisma.puzzle.count({ where: { ingestSource: "youtube" } }),
    prisma.puzzle.count({ where: { ingestSource: "youtube", createdAt: { gte: todayStart } } }),
    prisma.puzzle.findFirst({
      where: { ingestSource: "youtube" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, song: { select: { title: true, artist: true } } },
    }),
    prisma.puzzle.findMany({
      where: { ingestSource: "youtube" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { createdAt: true, song: { select: { title: true, artist: true } } },
    }),

    // ── Today ──
    prisma.player.count({ where: { lastSeenAt: { gte: todayStart } } }),
    prisma.run.count({ where: { startedAt: { gte: todayStart } } }),
    prisma.runRound.count({ where: { outcome: "SOLVED", resolvedAt: { gte: todayStart } } }),
    prisma.runRound.count({ where: { outcome: "FAILED", resolvedAt: { gte: todayStart } } }),

    // ── All-time guesses ──
    prisma.guess.count({ where: { isSkip: false } }),
    prisma.guess.count({ where: { isSkip: true } }),
    prisma.guess.count({ where: { isCorrect: true } }),

    // ── Chart: daily runs (14 days) ──
    prisma.$queryRaw<RawDayCount[]>`
      SELECT DATE("startedAt")::text AS day, COUNT(*)::int AS count
      FROM "Run"
      WHERE "startedAt" >= ${cutoff14}
      GROUP BY DATE("startedAt")
      ORDER BY day ASC
    `,

    // ── Chart: daily outcomes (14 days) ──
    prisma.$queryRaw<RawDayOutcome[]>`
      SELECT DATE("resolvedAt")::text AS day, outcome::text, COUNT(*)::int AS count
      FROM "RunRound"
      WHERE "resolvedAt" >= ${cutoff14} AND outcome != 'PENDING'
      GROUP BY DATE("resolvedAt"), outcome
      ORDER BY day ASC
    `,

    // ── Chart: top 10 songs ──
    prisma.$queryRaw<RawTopSong[]>`
      SELECT s.title, s.artist, p."playCount"::int AS plays, p."solveCount"::int AS solves
      FROM "Puzzle" p
      JOIN "Song" s ON s."puzzleId" = p.id
      WHERE p."playCount" > 0
      ORDER BY p."playCount" DESC
      LIMIT 10
    `,

    // ── Daily Challenges ──
    prisma.dailyChallenge.count(),
    prisma.dailyChallenge.count({ where: { publishedAt: { not: null } } }),
    prisma.run.count({
      where: { mode: "DAILY", dailyChallengeId: { not: null }, startedAt: { gte: todayStart } },
    }),
    prisma.run.count({ where: { mode: "DAILY", dailyChallengeId: { not: null } } }),
  ]);

  const correctRate = totalGuesses > 0
    ? `${Math.round((totalCorrect / totalGuesses) * 100)}% accuracy`
    : "No guesses yet";

  // Process chart data server-side so the client component receives plain JSON.
  const activityData = fillActivity(rawDailyRuns);
  const outcomeData  = fillOutcomes(rawDailyOutcomes);
  const topSongs     = buildTopSongs(rawTopSongs);

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-(--text-dim)">
          Platform overview — data refreshes on every page load.
        </p>
      </div>

      {/* ── Catalog ── */}
      <Section title="Catalog" subtitle="All songs in the database">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard value={totalSongs}       label="Total songs"       href="/admin/songs" />
          <StatCard value={activeSongs}      label="In catalog"        href="/admin/songs?status=active"       accent="green" />
          <StatCard value={blockedSongs}     label="Removed"           href="/admin/songs?status=removed"      accent={blockedSongs > 0 ? "red" : "default"} />
          <StatCard value={songsMissingClip} label="Missing audio clip" href="/admin/songs?status=missing-clip" accent={songsMissingClip > 0 ? "yellow" : "default"} />
        </div>
      </Section>

      {/* ── YouTube Imports ── */}
      <Section title="YouTube Imports" subtitle="Songs imported from YouTube playlists">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            value={youtubeSongCount}
            label="YouTube songs"
            sublabel={youtubeSongCount > 0 ? `Last: ${formatRelative(lastYoutubeImport?.createdAt)}` : "No imports yet"}
            href="/admin/songs"
            accent="blue"
          />
          <StatCard
            value={youtubeSongsToday}
            label="Imported today"
            sublabel={youtubeSongsToday > 0 ? "Songs added since midnight" : "None added today"}
            accent={youtubeSongsToday > 0 ? "green" : "default"}
          />
          <div className="rounded-2xl border border-(--hairline) bg-(--surface-strong) p-5">
            <p className="text-sm font-medium text-(--text-dim)">Most recent import</p>
            {lastYoutubeImport?.song ? (
              <div className="mt-2">
                <p className="truncate text-sm font-semibold text-(--text)">{lastYoutubeImport.song.title}</p>
                <p className="truncate text-xs text-(--text-dim)">{lastYoutubeImport.song.artist}</p>
                <p className="mt-1 text-xs text-(--text-faint)">
                  {formatDate(lastYoutubeImport.createdAt)} · {formatRelative(lastYoutubeImport.createdAt)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-(--text-faint)">No YouTube songs yet</p>
            )}
          </div>
        </div>

        {recentYoutubeImports.length > 0 && (
          <div className="rounded-2xl border border-(--hairline) bg-(--surface-strong)">
            <div className="border-b border-(--hairline) px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-(--text-dim)">
                Recent YouTube Imports
              </p>
            </div>
            <ul className="divide-y divide-(--hairline)">
              {recentYoutubeImports.map((p, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text)">{p.song?.title ?? "Unknown"}</p>
                    <p className="truncate text-xs text-(--text-dim)">{p.song?.artist ?? "—"}</p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p className="text-xs text-(--text-faint)">{formatDate(p.createdAt)}</p>
                    <p className="text-xs text-(--text-faint)">{formatRelative(p.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* ── All-Time Guess Stats ── */}
      <Section title="All-Time Guesses" subtitle="Cumulative across all players and games">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            value={fmtNumber(totalGuesses)}
            label="Total guesses"
            sublabel="Excluding skips"
          />
          <StatCard
            value={fmtNumber(totalCorrect)}
            label="Correct guesses"
            sublabel={correctRate}
            accent="green"
          />
          <StatCard
            value={fmtNumber(totalGuesses - totalCorrect)}
            label="Wrong guesses"
            sublabel="Correct answers missed"
            accent={totalGuesses - totalCorrect > totalCorrect ? "red" : "default"}
          />
          <StatCard
            value={fmtNumber(totalSkips)}
            label="Skips"
            sublabel="Player pressed skip"
            accent="yellow"
          />
        </div>
      </Section>

      {/* ── Players ── */}
      <Section title="Players">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard value={totalUsers}    label="Registered accounts" href="/admin/users" />
          <StatCard value={visitorsToday} label="Active players today" sublabel="Seen since midnight" accent="blue" />
          <StatCard value={runsToday}     label="Games started today"  accent={runsToday > 0 ? "green" : "default"} />
          <div className="rounded-2xl border border-(--hairline) bg-(--surface-strong) p-5">
            <p className="text-3xl font-bold text-(--text)">{solveRate(roundsSolvedToday, roundsFailedToday)}</p>
            <p className="mt-1 text-sm text-(--text-dim)">Solve rate today</p>
            <p className="mt-1 text-xs text-(--text-faint)">{roundsSolvedToday + roundsFailedToday} rounds resolved</p>
          </div>
        </div>
      </Section>

      {/* ── Today's Activity ── */}
      <Section
        title="Today's Activity"
        subtitle={`Data since midnight · refreshed at ${formatTime(now)}`}
        live
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard value={runsToday}                           label="Games started"    sublabel="Sessions today" accent="blue" />
          <StatCard value={roundsSolvedToday + roundsFailedToday} label="Rounds resolved"  sublabel="Solved + failed" />
          <StatCard
            value={roundsSolvedToday}
            label="Songs guessed ✓"
            sublabel={`${solveRate(roundsSolvedToday, roundsFailedToday)} solve rate`}
            accent="green"
          />
          <StatCard
            value={roundsFailedToday}
            label="Songs missed ✗"
            sublabel="Ended without solve"
            accent={roundsFailedToday > roundsSolvedToday ? "red" : "default"}
          />
        </div>
      </Section>

      {/* ── Daily Challenges ── */}
      <Section title="Daily Challenges" subtitle="Admin-curated daily song challenges">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard value={totalChallenges} label="Total challenges" href="/admin/daily-challenges" />
          <StatCard value={publishedChallenges} label="Published" accent="green" href="/admin/daily-challenges" />
          <StatCard value={todayDailyChallengeRuns} label="Playing today's challenge" accent="purple" />
          <StatCard value={allTimeDailyChallengeRuns} label="All-time challenge plays" accent="blue" />
        </div>
      </Section>

      {/* ── Charts ── */}
      <Section
        title="Charts"
        subtitle="Visual overview of game activity — last 14 days"
      >
        <DashboardCharts
          activityData={activityData}
          outcomeData={outcomeData}
          topSongs={topSongs}
        />
      </Section>
    </div>
  );
}

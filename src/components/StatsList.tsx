"use client";

import { useState } from "react";
import {
  RANKS_ASCENDING,
  TIER_LABELS,
  nearestAchievements,
  totalXpForLevel,
  type AchievementEntry,
  type PlayerLifetimeStats,
  type Progression,
} from "@/lib/game/progression";

type Props = {
  stats: PlayerLifetimeStats;
  progression: Progression;
  /// False for a player with no completed runs yet. Only changes the copy under
  /// the badge row — the badges themselves still render, because seeing what
  /// there is to play for is the point of showing them on day one.
  hasPlayed: boolean;
};

/// How many badges the summary shows. Three, and specifically the three nearest
/// to unlocking: the full twelve made the panel taller than the viewport, and a
/// wall of mostly-locked icons buries the two or three that are actually in
/// reach. The rest are one tap away.
const SUMMARY_BADGE_COUNT = 3;

type View = "summary" | "achievements" | "ranks";

function StatIcon({ path, className }: { path: React.ReactNode; className: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

/// Lifetime numbers, not this run's. Every value comes from the PlayerGameStat
/// rollup via GET /api/players/stats — see src/lib/game/progression.ts for
/// where the level curve and the badge thresholds are defined.
///
/// Three views behind one panel rather than three modals: the drill-downs are
/// reference material read once, and stacking dialogs to show a list costs a
/// second dismiss on the way back out.
export function StatsList({ stats, progression, hasPlayed }: Props) {
  const [view, setView] = useState<View>("summary");

  if (view === "achievements") {
    return (
      <SubView title="All achievements" onBack={() => setView("summary")}>
        <AllAchievements achievements={progression.achievements} />
      </SubView>
    );
  }

  if (view === "ranks") {
    return (
      <SubView title="All ranks" onBack={() => setView("summary")}>
        <AllRanks currentLevel={progression.level} />
      </SubView>
    );
  }

  return (
    <Summary
      stats={stats}
      progression={progression}
      hasPlayed={hasPlayed}
      onShowAchievements={() => setView("achievements")}
      onShowRanks={() => setView("ranks")}
    />
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function Summary({
  stats,
  progression,
  hasPlayed,
  onShowAchievements,
  onShowRanks,
}: Props & { onShowAchievements: () => void; onShowRanks: () => void }) {
  const { level, xpProgress, xpPerLevel, rankName, achievements, winRate } = progression;
  const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpPerLevel) * 100));
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const spotlight = nearestAchievements(achievements, SUMMARY_BADGE_COUNT);

  const tiles = [
    {
      label: "Tracks Named",
      value: stats.roundsSolved.toLocaleString(),
      icon: (
        <StatIcon
          className="text-(--signal)"
          path={<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />}
        />
      ),
    },
    {
      label: "Day Streak",
      value: String(stats.currentDailyStreak),
      icon: (
        <StatIcon
          className="text-orange-500"
          path={<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />}
        />
      ),
    },
    {
      label: "Best Streak",
      value: String(stats.longestDailyStreak),
      icon: (
        <StatIcon
          className="text-amber-500"
          path={
            <>
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h12v-2h-5v-2.34" />
              <path d="M12 2a7.7 7.7 0 0 1 7.54 9H4.46A7.7 7.7 0 0 1 12 2z" />
            </>
          }
        />
      ),
    },
    {
      label: "Win Rate",
      value: winRate === null ? "—" : `${winRate}%`,
      icon: (
        <StatIcon
          className="text-emerald-500"
          path={
            <>
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </>
          }
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="flex flex-col items-center justify-center rounded-[10px] border border-(--hairline) bg-(--surface) p-3 text-center shadow-xs transition-all duration-200 hover:bg-(--surface-hover)"
          >
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full border border-(--hairline) bg-(--surface-strong)">
              {tile.icon}
            </div>
            <span className="font-mono text-xl font-bold tracking-tight text-(--text)">
              {tile.value}
            </span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
              {tile.label}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-[10px] border border-(--hairline) bg-(--surface) p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
              Current Rank
            </span>
            <span className="text-sm font-bold text-(--signal)">{rankName}</span>
          </div>
          <div className="text-right">
            <span className="font-mono text-[10px] text-(--text-dim)">
              Lv. {level} • <strong className="font-semibold text-(--text)">{xpProgress}</strong> /{" "}
              {xpPerLevel} XP
            </span>
          </div>
        </div>

        <div className="relative h-2 w-full overflow-hidden rounded-full border border-(--hairline) bg-(--surface-strong)">
          <div
            className="h-full rounded-full bg-gradient-to-r from-(--signal) to-orange-400 shadow-[0_0_8px_rgba(242,184,75,0.3)] transition-all duration-1000 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <button
          type="button"
          onClick={onShowRanks}
          className="mt-3 w-full rounded-[7px] border border-(--hairline) py-2 text-xs font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
        >
          See all ranks
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-0.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
            Closest badges
          </span>
          <span className="font-mono text-[9px] text-(--text-faint)">
            {unlockedCount} / {achievements.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {spotlight.map((entry) => (
            <Badge key={entry.id} entry={entry} />
          ))}
        </div>

        <button
          type="button"
          onClick={onShowAchievements}
          className="mt-1 w-full rounded-[7px] border border-(--hairline) py-2 text-xs font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
        >
          See all achievements
        </button>

        <p className="px-0.5 text-[11px] leading-snug text-(--text-faint)">
          {hasPlayed
            ? "Badges track your whole history — they carry across every set you play."
            : "Play a set to start the ladder. Badges track your whole history, not one day."}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drill-downs
// ---------------------------------------------------------------------------

function SubView({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start rounded-[6px] py-1 pr-2 text-xs font-semibold text-(--text-dim) transition-colors duration-200 hover:text-(--text)"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      <span className="px-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
        {title}
      </span>

      {children}
    </div>
  );
}

/// The full twelve, grouped into the four horizons. A locked tier-4 badge next
/// to a lit tier-1 badge reads as failure; under a "The long haul" heading it
/// reads as a roadmap.
function AllAchievements({ achievements }: { achievements: AchievementEntry[] }) {
  const tiers = ([1, 2, 3, 4] as const)
    .map((tier) => ({ tier, entries: achievements.filter((a) => a.tier === tier) }))
    .filter((group) => group.entries.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {tiers.map(({ tier, entries }) => (
        <div key={tier} className="flex flex-col gap-1.5">
          <span className="px-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-(--text-faint) opacity-70">
            {TIER_LABELS[tier]}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {entries.map((entry) => (
              <Badge key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/// Every rank and what it costs. The XP column is the cumulative lifetime total
/// needed to reach that level, not the per-level step — "what's it going to
/// take" is the only question this list is here to answer.
function AllRanks({ currentLevel }: { currentLevel: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {RANKS_ASCENDING.map((rank) => {
        const reached = currentLevel >= rank.minLevel;
        return (
          <div
            key={rank.name}
            className={`flex items-center justify-between gap-3 rounded-[8px] border px-3 py-2.5 transition-colors ${
              reached
                ? "border-(--signal)/40 bg-(--signal)/10"
                : "border-(--hairline) bg-transparent"
            }`}
          >
            <div className="flex min-w-0 flex-col">
              <span
                className={`truncate text-sm font-bold ${
                  reached ? "text-(--signal)" : "text-(--text-dim)"
                }`}
              >
                {rank.name}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">
                {totalXpForLevel(rank.minLevel).toLocaleString()} XP
              </span>
            </div>
            <span
              className={`shrink-0 font-mono text-[10px] tabular-nums ${
                reached ? "text-(--signal)" : "text-(--text-faint)"
              }`}
            >
              Lv. {rank.minLevel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

/// Locked badges show how far along they are rather than just sitting greyed
/// out. A wall of anonymous grey icons reads as "not for you"; "38 / 250" reads
/// as a thing in progress, which is the entire reason the thresholds are long.
function Badge({ entry }: { entry: AchievementEntry }) {
  const percent = entry.target > 0 ? Math.min(100, (entry.progress / entry.target) * 100) : 0;
  const label = entry.unlocked
    ? `${entry.name}: ${entry.desc} — unlocked`
    : `${entry.name}: ${entry.desc} — ${entry.progress.toLocaleString()} of ${entry.target.toLocaleString()}`;

  return (
    <div
      title={label}
      aria-label={label}
      className={`flex flex-col items-center justify-center rounded-[8px] border p-2 text-center transition-all duration-300 ${
        entry.unlocked
          ? `bg-gradient-to-b ${entry.color}`
          : "border-(--hairline) bg-transparent text-(--text-faint)"
      }`}
    >
      <span className={`mb-0.5 text-lg ${entry.unlocked ? "" : "opacity-30 grayscale"}`}>
        {entry.icon}
      </span>
      <span className="w-full truncate font-mono text-[9px] font-extrabold uppercase tracking-tight">
        {entry.name}
      </span>

      {entry.unlocked ? null : (
        <>
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-(--hairline)">
            <div className="h-full rounded-full bg-(--text-faint)" style={{ width: `${percent}%` }} />
          </div>
          <span className="mt-1 font-mono text-[8px] tabular-nums text-(--text-faint)">
            {entry.progress.toLocaleString()}/{entry.target.toLocaleString()}
          </span>
        </>
      )}
    </div>
  );
}

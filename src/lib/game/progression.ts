/// Player progression — levels, ranks and achievements — derived from the
/// LIFETIME rollup in PlayerGameStat, not from a single run.
///
/// This replaces a per-run version that fed one run's score into the level
/// curve. That made every player "Novice Listener, Lv. 1" at the start of every
/// run, and put every badge within reach of a single good session: "Maestro"
/// wanted a 10-solve streak, "Audiophile" a 1,000-point score — both routine in
/// one ten-round day. Nothing carried, so nothing was worth coming back for.
///
/// Deliberately pure and free of `server-only`: the API route derives these and
/// the stats panel renders them, so both sides share one definition and can't
/// disagree about what unlocks when.

/// The lifetime columns this module reads. A structural subset of
/// PlayerGameStat, so a Prisma row satisfies it directly.
export type PlayerLifetimeStats = {
  runsPlayed: number;
  roundsPlayed: number;
  roundsSolved: number;
  bestRunScore: number;
  bestDailyScore: number;
  bestRoundStreak: number;
  currentDailyStreak: number;
  longestDailyStreak: number;
  xp: number;
};

export const EMPTY_LIFETIME_STATS: PlayerLifetimeStats = {
  runsPlayed: 0,
  roundsPlayed: 0,
  roundsSolved: 0,
  bestRunScore: 0,
  bestDailyScore: 0,
  bestRoundStreak: 0,
  currentDailyStreak: 0,
  longestDailyStreak: 0,
  xp: 0,
};

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/// XP to clear level L. Linear in L, so cumulative cost is quadratic — the
/// curve stretches without ever gating a level behind a wall that reads as
/// hopeless.
///
/// Calibrated against what a daily player actually banks. Scoring v1 pays
/// XP_BASE 10 + 4 per unused attempt, so a ten-round day is roughly 150–250 XP:
///
///   Lv. 10  →   5,400 XP  ≈  one month
///   Lv. 20  →  20,900 XP  ≈  four months
///   Lv. 30  →  46,400 XP  ≈  eight months
///   Lv. 50  → 127,400 XP  ≈  two years
///
/// Retuning this is a live change to everyone's displayed level, so treat it
/// the way scoring/v1.ts treats its own constants: add a curve, don't edit one.
export function xpForLevel(level: number): number {
  return 100 + 100 * level;
}

export type LevelState = {
  level: number;
  /// XP banked toward the NEXT level, not lifetime XP.
  xpProgress: number;
  /// Cost of the level currently being worked through.
  xpPerLevel: number;
};

export function levelFromXp(totalXp: number): LevelState {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));

  // Bounded by the curve itself: each iteration subtracts at least 200, so even
  // an absurd XP total terminates in a few hundred passes.
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }

  return { level, xpProgress: remaining, xpPerLevel: xpForLevel(level) };
}

/// Lifetime XP needed to REACH a level from zero — the running total of every
/// xpForLevel below it. What the ranks view prints next to each tier, so a
/// player can see the actual cost of the next rank rather than just its level.
export function totalXpForLevel(level: number): number {
  const steps = Math.max(0, level - 1);
  return 100 * steps + 100 * ((steps * (steps + 1)) / 2);
}

export type Rank = { minLevel: number; name: string };

/// Rank names are unchanged from the per-run version — only the thresholds
/// they sit behind are, because they are now crossed once rather than on every
/// run. "Midnight Legend" used to need level 81 of a curve that reset each
/// session, which made it unreachable by construction.
///
/// Descending, because rankForLevel wants the first match. RANKS_ASCENDING is
/// the same list the other way up, for display.
const RANKS: Rank[] = [
  { minLevel: 50, name: "Midnight Legend" },
  { minLevel: 30, name: "Soundwave Maestro" },
  { minLevel: 20, name: "Frequency Expert" },
  { minLevel: 12, name: "Melody Scout" },
  { minLevel: 5, name: "Signal Catcher" },
  { minLevel: 1, name: "Novice Listener" },
];

export const RANKS_ASCENDING: Rank[] = [...RANKS].reverse();

export function rankForLevel(level: number): string {
  return RANKS.find((rank) => level >= rank.minLevel)?.name ?? "Novice Listener";
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export type AchievementEntry = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  unlocked: boolean;
  color: string;
  /// How far along the player is, and what they are climbing toward. Both in
  /// the metric's own units so the panel can render "38 / 250" without knowing
  /// which stat backs the badge. `progress` is clamped to `target`.
  progress: number;
  target: number;
  /// 1–4. Groups the grid into horizons rather than one flat wall of icons —
  /// see TIER_LABELS.
  tier: 1 | 2 | 3 | 4;
};

export const TIER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "First week",
  2: "First month",
  3: "Months in",
  4: "The long haul",
};

type AchievementSpec = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  tier: 1 | 2 | 3 | 4;
  target: number;
  /// The lifetime number this badge tracks.
  value: (stats: PlayerLifetimeStats) => number;
};

/// Four horizons, three badges each.
///
/// The shape matters more than any single threshold: tier 1 is reachable in a
/// first sitting so the grid is never blank, and every tier after it is gated
/// on something that CANNOT be rushed in one session — days returned to,
/// hundreds of tracks named, six-figure XP. A player who binges for an evening
/// finishes tier 1 and can see, precisely, that tiers 2–4 want days.
///
/// Every target reads off a column PlayerGameStat already carries. Nothing here
/// needs a migration, which is also the constraint that shaped it: there is no
/// lifetime counter for one-attempt solves, so there is no "perfect ear" badge
/// yet. Adding one means a column and a backfill, not just an entry here.
const ACHIEVEMENT_SPECS: AchievementSpec[] = [
  // --- Tier 1 — a first sitting, and the first few days back -------------
  {
    id: "first_lock",
    name: "First Lock",
    desc: "Name your first track",
    icon: "🏆",
    color: "from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/30",
    tier: 1,
    target: 1,
    value: (s) => s.roundsSolved,
  },
  {
    id: "three_day",
    name: "Hat Trick",
    desc: "Play three days running",
    icon: "🔁",
    color: "from-lime-500/20 to-lime-500/5 text-lime-500 border-lime-500/30",
    tier: 1,
    target: 3,
    value: (s) => s.longestDailyStreak,
  },
  {
    id: "week_one",
    name: "Week One",
    desc: "A seven-day streak",
    icon: "📅",
    color: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/30",
    tier: 1,
    target: 7,
    value: (s) => s.longestDailyStreak,
  },

  // --- Tier 2 — a month of showing up ------------------------------------
  {
    id: "crate_digger",
    name: "Crate Digger",
    desc: "Name 50 tracks",
    icon: "📦",
    color: "from-sky-500/20 to-sky-500/5 text-sky-500 border-sky-500/30",
    tier: 2,
    target: 50,
    value: (s) => s.roundsSolved,
  },
  {
    id: "maestro",
    name: "Maestro",
    desc: "Ten straight solves in one run",
    icon: "🔥",
    color: "from-orange-500/20 to-red-500/5 text-orange-500 border-orange-500/30",
    tier: 2,
    target: 10,
    value: (s) => s.bestRoundStreak,
  },
  {
    id: "moon_cycle",
    name: "Moon Cycle",
    desc: "A thirty-day streak",
    icon: "🌙",
    color: "from-indigo-500/20 to-indigo-500/5 text-indigo-500 border-indigo-500/30",
    tier: 2,
    target: 30,
    value: (s) => s.longestDailyStreak,
  },

  // --- Tier 3 — months in -------------------------------------------------
  {
    id: "deep_cuts",
    name: "Deep Cuts",
    desc: "Name 250 tracks",
    icon: "💽",
    color: "from-violet-500/20 to-violet-500/5 text-violet-500 border-violet-500/30",
    tier: 3,
    target: 250,
    value: (s) => s.roundsSolved,
  },
  {
    id: "audiophile",
    name: "Audiophile",
    desc: "Score 8,000 in a single run",
    icon: "👑",
    color: "from-purple-500/20 to-purple-500/5 text-purple-500 border-purple-500/30",
    tier: 3,
    // A flawless ten-round day tops out near 16,800, and that needs every song
    // named off the 200ms clip. 8,000 is a genuinely strong day, not a perfect
    // one.
    target: 8000,
    value: (s) => s.bestRunScore,
  },
  {
    id: "resident",
    name: "Resident",
    desc: "Finish 100 runs",
    icon: "🎧",
    color: "from-teal-500/20 to-teal-500/5 text-teal-500 border-teal-500/30",
    tier: 3,
    target: 100,
    value: (s) => s.runsPlayed,
  },

  // --- Tier 4 — the long haul --------------------------------------------
  {
    id: "archivist",
    name: "Archivist",
    desc: "Name 1,000 tracks",
    icon: "🗄️",
    color: "from-cyan-500/20 to-cyan-500/5 text-cyan-500 border-cyan-500/30",
    tier: 4,
    target: 1000,
    value: (s) => s.roundsSolved,
  },
  {
    id: "centurion",
    name: "Centurion",
    desc: "A hundred-day streak",
    icon: "💯",
    color: "from-rose-500/20 to-rose-500/5 text-rose-500 border-rose-500/30",
    tier: 4,
    target: 100,
    value: (s) => s.longestDailyStreak,
  },
  {
    id: "midnight_legend",
    name: "Legend",
    desc: "Bank 100,000 XP",
    icon: "🌗",
    color: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500 border-fuchsia-500/30",
    tier: 4,
    target: 100000,
    value: (s) => s.xp,
  },
];

/// The badges closest to unlocking. Locked ones first, then by tier, then by
/// how far along the bar is. Already-won badges backfill only once there is
/// nothing left to chase. Shared by the stats panel and the end-of-run panel so
/// "what's next" means the same thing in both.
///
/// Tier outranks the progress bar deliberately. Sorting on the fraction alone
/// buried "First Lock" — one track, the easiest badge in the game — beneath a
/// thirty-day streak sitting at 1/30, because 0% reads as further away than
/// 3.3%. The fraction is only comparable between badges measured in the same
/// units over the same horizon, and that is exactly what a tier is.
export function nearestAchievements(
  entries: AchievementEntry[],
  count: number,
): AchievementEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.progress / b.target - a.progress / a.target;
    })
    .slice(0, count);
}

export function achievementsFor(stats: PlayerLifetimeStats): AchievementEntry[] {
  return ACHIEVEMENT_SPECS.map((spec) => {
    const raw = spec.value(stats);
    return {
      id: spec.id,
      name: spec.name,
      desc: spec.desc,
      icon: spec.icon,
      color: spec.color,
      tier: spec.tier,
      target: spec.target,
      progress: Math.min(raw, spec.target),
      unlocked: raw >= spec.target,
    };
  });
}

// ---------------------------------------------------------------------------
// The whole picture
// ---------------------------------------------------------------------------

export type Progression = LevelState & {
  rankName: string;
  achievements: AchievementEntry[];
  /// Solved as a percentage of played. Null until something has been played, so
  /// the panel shows "—" rather than a demoralising 0%.
  winRate: number | null;
};

export function computeProgression(stats: PlayerLifetimeStats): Progression {
  const level = levelFromXp(stats.xp);

  return {
    ...level,
    rankName: rankForLevel(level.level),
    achievements: achievementsFor(stats),
    winRate:
      stats.roundsPlayed > 0
        ? Math.round((stats.roundsSolved / stats.roundsPlayed) * 100)
        : null,
  };
}

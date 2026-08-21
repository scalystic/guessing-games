"use client";

import type { RoundHistoryEntry } from "@/hooks/useMelodleGame";

type SessionStats = {
  roundsPlayed: number;
  roundsSolved: number;
  bestStreak: number;
  roundHistory: RoundHistoryEntry[];
};

type Achievement = {
  key: string;
  icon: string;
  label: string;
  hint: string;
  check: (s: SessionStats) => boolean;
};

// Every condition here is derived from real session state — nothing here
// claims progress that didn't happen, unlike a "coming soon" placeholder.
// It resets when the tab closes since there's no account/backend to persist
// it yet, same as every other stat in this session.
const ACHIEVEMENTS: Achievement[] = [
  {
    key: "first-win",
    icon: "🏆",
    label: "First Win",
    hint: "Solve one song",
    check: (s) => s.roundsSolved >= 1,
  },
  {
    key: "hot-streak",
    icon: "🔥",
    label: "Hot Streak",
    hint: "Reach a 3-round streak",
    check: (s) => s.bestStreak >= 3,
  },
  {
    key: "perfectionist",
    icon: "🎯",
    label: "Perfectionist",
    hint: "Solve in 1 attempt",
    check: (s) => s.roundHistory.some((r) => r.solved && r.attemptsUsed === 1),
  },
  {
    key: "quick-draw",
    icon: "⚡",
    label: "Quick Draw",
    hint: "Solve in 2 attempts or fewer",
    check: (s) => s.roundHistory.some((r) => r.solved && r.attemptsUsed <= 2),
  },
  {
    key: "bollywood-buff",
    icon: "🎬",
    label: "Bollywood Buff",
    hint: "Play 5 rounds",
    check: (s) => s.roundsPlayed >= 5,
  },
  {
    key: "marathon",
    icon: "🏃",
    label: "Marathon",
    hint: "Play 10 rounds",
    check: (s) => s.roundsPlayed >= 10,
  },
];

export function Achievements({ accent, ...stats }: SessionStats & { accent: string }) {
  const unlockedCount = ACHIEVEMENTS.filter((a) => a.check(stats)).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-(--text-faint)">
        {unlockedCount} of {ACHIEVEMENTS.length} unlocked this session — resets when you close the
        tab, since there&apos;s no account to save it to yet.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = a.check(stats);
          return (
            <div
              key={a.key}
              className="flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition"
              style={{
                border: unlocked ? `1px solid ${accent}55` : "1px dashed var(--hairline)",
                background: unlocked ? `${accent}14` : "transparent",
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
                style={{ background: unlocked ? `${accent}22` : "var(--surface-hover)" }}
              >
                <span style={{ opacity: unlocked ? 1 : 0.35 }}>{a.icon}</span>
              </span>
              <p
                className="text-xs font-semibold"
                style={{ color: unlocked ? "var(--text)" : "var(--text-faint)" }}
              >
                {a.label}
              </p>
              <p className="text-[10px] text-(--text-faint)">{unlocked ? "Unlocked" : a.hint}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

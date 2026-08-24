"use client";

import type { RoundHistoryEntry, AchievementEntry } from "@/hooks/useMelodleGame";

type Props = {
  streak: number;
  bestStreak: number;
  score: number;
  roundsPlayed: number;
  roundsSolved: number;
  roundHistory: RoundHistoryEntry[];
  level: number;
  xpProgress: number;
  xpPerLevel: number;
  rankName: string;
  achievements: AchievementEntry[];
};

export function StatsList({
  streak,
  bestStreak,
  score,
  roundsPlayed,
  roundsSolved,
  roundHistory,
  level,
  xpProgress,
  xpPerLevel,
  rankName,
  achievements,
}: Props) {
  const winRate = roundsPlayed > 0 ? Math.round((roundsSolved / roundsPlayed) * 100) : null;
  const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpPerLevel) * 100));

  const stats = [
    {
      label: "Score",
      value: score.toLocaleString(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-(--signal)">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      label: "Streak",
      value: String(streak),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ),
    },
    {
      label: "Best Streak",
      value: String(bestStreak),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h12v-2h-5v-2.34" />
          <path d="M12 2a7.7 7.7 0 0 1 7.54 9H4.46A7.7 7.7 0 0 1 12 2z" />
        </svg>
      ),
    },
    {
      label: "Win Rate",
      value: winRate === null ? "—" : `${winRate}%`,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 2x2 Grid of Stats */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center justify-center rounded-[10px] border border-(--hairline) bg-(--surface) p-3 text-center shadow-xs transition-all duration-200 hover:bg-(--surface-hover)"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-(--surface-strong) border border-(--hairline) mb-2">
              {s.icon}
            </div>
            <span className="font-mono text-xl font-bold tracking-tight text-(--text)">{s.value}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint) mt-1">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-(--hairline)" />

      {/* Level Progress */}
      <div className="rounded-[10px] border border-(--hairline) bg-(--surface) p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Current Rank</span>
            <span className="text-sm font-bold text-(--signal)">{rankName}</span>
          </div>
          <div className="text-right">
            <span className="font-mono text-[10px] text-(--text-dim)">
              Lv. {level} • <strong className="font-semibold text-(--text)">{xpProgress}</strong> / {xpPerLevel} XP
            </span>
          </div>
        </div>
        
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-(--surface-strong) border border-(--hairline)">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-(--signal) to-orange-400 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(242,184,75,0.3)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-(--hairline)" />

      {/* Achievements Badges list */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint) px-0.5">Achievements</span>
        <div className="grid grid-cols-4 gap-2">
          {achievements.map((ach) => (
            <div
              key={ach.id}
              title={`${ach.name}: ${ach.desc}`}
              className={`flex flex-col items-center justify-center p-2 rounded-[8px] border text-center transition-all duration-300 ${
                ach.unlocked
                  ? `bg-gradient-to-b ${ach.color}`
                  : "bg-transparent border-(--hairline) opacity-25 grayscale"
              }`}
            >
              <span className="text-lg mb-0.5">{ach.icon}</span>
              <span className="text-[9px] font-extrabold tracking-tight truncate w-full uppercase font-mono">{ach.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

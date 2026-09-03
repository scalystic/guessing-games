"use client";

import { useEffect, useState } from "react";
import { DailyCalendarModal } from "@/components/DailyCalendarModal";

type Day = {
  dayKey: string;
  dayNumber: number;
  isToday: boolean;
  hasChallenge: boolean;
  played: boolean;
};

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/// A week-view strip of the last 7 days ending today, each a circle marked
/// whether this player played that day's daily challenge — same idea as a
/// Duolingo-style streak calendar. Backed by GET /api/daily-challenge/history,
/// which reads Run history directly; nothing here is stored client-side.
export function DailyStreakStrip({ gameSlug }: { gameSlug: string }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/daily-challenge/history?gameSlug=${encodeURIComponent(gameSlug)}&days=7`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.data) setDays(json.data.days);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [gameSlug]);

  if (!days) {
    return (
      <div className="flex justify-center gap-2 sm:gap-3" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-11 w-11 animate-pulse rounded-full bg-(--surface)" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <ul className="flex justify-center gap-2 sm:gap-3" aria-label="Your last 7 daily challenges">
        {days.map((day, i) => (
          <li key={day.dayKey} className="flex flex-col items-center gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-(--text-faint)">
              {WEEKDAY_LABELS[new Date(day.dayKey).getUTCDay()] ?? WEEKDAY_LABELS[i]}
            </span>
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition"
              style={
                day.played
                  ? { background: "var(--signal)", color: "var(--signal-ink)" }
                  : day.isToday
                    ? { border: "2px solid var(--signal)", color: "var(--text)" }
                    : day.hasChallenge
                      ? { border: "1px solid var(--hairline)", color: "var(--text-dim)" }
                      : { border: "1px dashed var(--hairline)", color: "var(--text-faint)" }
              }
              title={
                day.played
                  ? `Played on ${day.dayKey}`
                  : day.hasChallenge
                    ? day.isToday
                      ? "Today — not played yet"
                      : `Missed on ${day.dayKey}`
                    : `No daily challenge on ${day.dayKey}`
              }
            >
              {day.played ? (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                day.dayNumber
              )}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setShowCalendar(true)}
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-400 underline decoration-(--hairline) underline-offset-4 transition hover:text-violet-300"
      >
        View full calendar
      </button>

      {showCalendar && (
        <DailyCalendarModal gameSlug={gameSlug} onClose={() => setShowCalendar(false)} />
      )}
    </div>
  );
}

"use client";

import type { DailyDay } from "@/hooks/useDailyHistory";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/// A week-view strip of the last 7 days ending today, each a circle marked
/// whether this player played that day's daily challenge — same idea as a
/// Duolingo-style streak calendar. The `days` come from useDailyHistory in the
/// page, shared with the header streak pill.
///
/// This sits *below* the deck now. As a band above the game it pushed the
/// player off the fold on a phone, which is why the circles are 32px here
/// rather than 44px and the whole thing is one row.
export function DailyStreakStrip({
  days,
  onOpenCalendar,
}: {
  days: DailyDay[] | null;
  onOpenCalendar: () => void;
}) {
  if (!days) {
    return (
      <div className="flex items-center justify-center gap-2" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 w-8 animate-pulse rounded-full bg-(--surface)" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ul className="flex items-center justify-center gap-1.5 sm:gap-2" aria-label="Your last 7 daily challenges">
        {days.map((day, i) => (
          <li key={day.dayKey} className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-(--text-faint)">
              {WEEKDAY_LABELS[new Date(day.dayKey).getUTCDay()] ?? WEEKDAY_LABELS[i]}
            </span>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition"
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
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
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
        onClick={onOpenCalendar}
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-(--signal) underline decoration-(--hairline) underline-offset-4 transition hover:text-(--text)"
      >
        Full calendar
      </button>
    </div>
  );
}

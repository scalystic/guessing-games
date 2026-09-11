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

      {/* An icon, not the "Full calendar" label this used to be: at the end of
          a row of seven date circles the strip reads as a calendar already, so
          the words were saying what the row was. Sized and shaped like one more
          circle, and self-end rather than centred so it lines up with the
          circles instead of with the whole column (which includes the weekday
          letters above them). */}
      <button
        type="button"
        onClick={onOpenCalendar}
        aria-label="Open full calendar"
        title="Full calendar"
        className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full border border-(--hairline) text-(--signal) transition hover:bg-(--surface-hover) hover:text-(--text)"
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M3 9h14M7 2v3M13 2v3" strokeLinecap="round" />
          <path d="M6.5 12.5h1.2M9.4 12.5h1.2M12.3 12.5h1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

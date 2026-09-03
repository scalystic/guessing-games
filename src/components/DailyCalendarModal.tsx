"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";

type Day = {
  dayKey: string;
  dayNumber: number;
  isToday: boolean;
  isFuture: boolean;
  hasChallenge: boolean;
  played: boolean;
};

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/// Full month-grid version of DailyStreakStrip's week view — same "played"
/// data (GET /api/daily-challenge/history), just a whole calendar month at a
/// time instead of the last 7 days, with month navigation capped at the
/// current month (nothing to show for a month that hasn't happened yet).
export function DailyCalendarModal({ gameSlug, onClose }: { gameSlug: string; onClose: () => void }) {
  const [month, setMonth] = useState(currentMonthKey());
  const [days, setDays] = useState<Day[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    fetch(`/api/daily-challenge/history?gameSlug=${encodeURIComponent(gameSlug)}&month=${month}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.data) setDays(json.data.days);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [gameSlug, month]);

  // Blank leading cells so day 1 lands under its actual weekday.
  const leadingBlanks = days && days.length > 0 ? new Date(`${days[0].dayKey}T00:00:00Z`).getUTCDay() : 0;
  const atCurrentMonth = month >= currentMonthKey();

  return (
    <Modal title="Daily Challenge Calendar" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-(--text-dim) transition hover:bg-(--surface-hover) hover:text-(--text)"
            aria-label="Previous month"
          >
            ‹
          </button>
          <p className="text-sm font-semibold text-(--text)">{monthLabel(month)}</p>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonthKey(m, 1))}
            disabled={atCurrentMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-(--text-dim) transition hover:bg-(--surface-hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="text-center font-mono text-[9px] uppercase tracking-[0.1em] text-(--text-faint)"
            >
              {label}
            </span>
          ))}

          {!days &&
            Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-(--surface)" />
            ))}

          {days && (
            <>
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {days.map((day) => (
                <div
                  key={day.dayKey}
                  className="flex aspect-square items-center justify-center rounded-lg text-xs font-bold"
                  style={
                    day.played
                      ? { background: "var(--signal)", color: "var(--signal-ink)" }
                      : day.isToday
                        ? { border: "2px solid var(--signal)", color: "var(--text)" }
                        : day.isFuture
                          ? { color: "var(--text-faint)" }
                          : day.hasChallenge
                            ? { border: "1px solid var(--hairline)", color: "var(--text-dim)" }
                            : { border: "1px dashed var(--hairline)", color: "var(--text-faint)" }
                  }
                  title={
                    day.played
                      ? `Played on ${day.dayKey}`
                      : day.isFuture
                        ? day.dayKey
                        : day.hasChallenge
                          ? `Missed on ${day.dayKey}`
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
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

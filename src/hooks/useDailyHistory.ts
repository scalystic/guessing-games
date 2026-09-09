"use client";

import { useEffect, useMemo, useState } from "react";

export type DailyDay = {
  dayKey: string;
  dayNumber: number;
  isToday: boolean;
  hasChallenge: boolean;
  played: boolean;
};

/// Longest run of played days ending at today. Today being unplayed doesn't
/// break it — the day isn't over yet — and days that never had a challenge
/// published are skipped rather than counted as misses.
function streakFrom(days: DailyDay[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day.played) {
      streak += 1;
      continue;
    }
    if (day.isToday || !day.hasChallenge) continue;
    break;
  }
  return streak;
}

/// One fetch of GET /api/daily-challenge/history, shared by the header streak
/// pill and the week strip below the game so the two can't disagree — and so
/// the same page doesn't hit the endpoint twice. Pulls a month-deep window
/// because a 7-day window would cap the streak count at 7.
export function useDailyHistory(gameSlug: string, windowDays = 30) {
  const [days, setDays] = useState<DailyDay[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/daily-challenge/history?gameSlug=${encodeURIComponent(gameSlug)}&days=${windowDays}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.data) setDays(json.data.days as DailyDay[]);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [gameSlug, windowDays]);

  return useMemo(
    () => ({
      days,
      week: days ? days.slice(-7) : null,
      streak: days ? streakFrom(days) : null,
    }),
    [days],
  );
}

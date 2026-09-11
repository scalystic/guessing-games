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
///
/// `reloadKey` refetches when it changes. Without it this fetched once on
/// mount and never again, which meant finishing today's challenge left both
/// readers showing the state from *before* the run: today unchecked in the
/// week strip, and a streak pill one day short. The day you just played is the
/// one day you look for, so pass the run's completion in here.
export function useDailyHistory(gameSlug: string, reloadKey: unknown = null, windowDays = 30) {
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
    // reloadKey is a refetch trigger, not a request input — the dependency
    // list is the only thing that reads it.
  }, [gameSlug, windowDays, reloadKey]);

  return useMemo(
    () => ({
      days,
      week: days ? days.slice(-7) : null,
      streak: days ? streakFrom(days) : null,
    }),
    [days],
  );
}

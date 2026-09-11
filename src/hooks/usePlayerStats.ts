"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_LIFETIME_STATS,
  computeProgression,
  type PlayerLifetimeStats,
  type Progression,
} from "@/lib/game/progression";

export type PlayerStats = {
  hasPlayed: boolean;
  stats: PlayerLifetimeStats;
  progression: Progression;
};

/// One fetch of GET /api/players/stats — the player's LIFETIME totals plus the
/// level, rank and badge ladder derived from them.
///
/// `reloadKey` refetches when it changes, for the same reason useDailyHistory
/// takes one: finishing today's run is exactly the moment these numbers move,
/// and a panel opened straight afterwards would otherwise show the state from
/// before the run that just ended.
///
/// A failed fetch settles on zeroed stats rather than staying null forever. The
/// panel is a side view, never the thing standing between a player and a game,
/// so an empty grid beats an error state or a permanent spinner.
export function usePlayerStats(gameSlug: string, reloadKey: unknown = null) {
  const [data, setData] = useState<PlayerStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/players/stats?gameSlug=${encodeURIComponent(gameSlug)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.data) {
          setData(json.data as PlayerStats);
        } else {
          setData(emptyStats());
        }
      })
      .catch(() => {
        if (!cancelled) setData(emptyStats());
      });

    return () => {
      cancelled = true;
    };
    // reloadKey is a refetch trigger, not a request input.
  }, [gameSlug, reloadKey]);

  return data;
}

function emptyStats(): PlayerStats {
  return {
    hasPlayed: false,
    stats: EMPTY_LIFETIME_STATS,
    progression: computeProgression(EMPTY_LIFETIME_STATS),
  };
}

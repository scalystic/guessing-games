"use client";

/// Daily Hit — one song, the same for everyone, resetting at midnight.
///
/// Not playable yet, and deliberately not faked. A daily has exactly one
/// property that makes it worth playing: every player gets the same puzzle, so
/// the scores compare. That requires a published DailyChallenge to draw a frozen
/// puzzle set from, which is why POST /api/runs answers `mode: "DAILY"` with
/// 501 rather than quietly sampling per-player. See docs/game-engine.md § v1
/// scope.
///
/// This used to run locally against a static song table, picking a "daily" by
/// hashing the date. That version looked finished while being per-device — the
/// one thing a daily must never be.

export function DailyHit({ accent }: { accent: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="text-3xl" aria-hidden="true">
        📅
      </span>
      <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
        Daily Hit is coming
      </p>
      <p className="max-w-xs text-sm text-(--text-dim)">
        One song, the same for every player, with a shared leaderboard for the day. It needs the
        daily challenge scheduler on the server before it can mean anything — until then, Practice
        mode is the real game.
      </p>
      <span
        className="mt-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ background: `${accent}1f`, color: accent }}
      >
        In progress
      </span>
    </div>
  );
}

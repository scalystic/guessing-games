"use client";

/// 60-Second Sprint — as many songs as you can before the clock runs out.
///
/// Not playable yet, and deliberately not faked. This is an ENDLESS-shaped mode:
/// unbounded rounds with a wall-clock limit. The engine already handles
/// unbounded runs (`Run.maxRounds = null`), but ENDLESS is listed as schema
/// present / unwired in docs/game-engine.md § v1 scope, and POST /api/runs
/// answers anything other than PRACTICE with 501.
///
/// The previous version ran a full sprint against a static song table in the
/// browser, scoring itself and keeping a "best" in localStorage. Every number it
/// showed was real only to that device.

export function Challenge({ accent }: { accent: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="text-3xl" aria-hidden="true">
        ⏱️
      </span>
      <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
        60-Second Sprint is coming
      </p>
      <p className="max-w-xs text-sm text-(--text-dim)">
        Guess as many songs as you can against the clock. The run engine already supports unbounded
        rounds, so this is mostly a matter of turning on endless mode and timing it server-side.
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

"use client";

function StreakIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

type Props = {
  current: number | null;
  /// Second number shown after a divider — the all-time best on a practice
  /// run. Omit on the daily page, where there's only one streak that matters.
  best?: number;
  ariaLabel: string;
  onClick: () => void;
};

/// Streak lives in the header row rather than in a band of its own above the
/// deck: the game has to clear the fold on a phone, and a row that already
/// exists costs no vertical space. The full picture (history, calendar) is one
/// tap away behind this pill.
export function StreakPill({ current, best, ariaLabel, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-(--hairline) bg-(--surface) px-3 transition-colors duration-200 hover:bg-(--surface-hover)"
    >
      <span className="text-(--signal)">
        <StreakIcon />
      </span>
      <span className="text-sm font-bold tabular-nums text-(--signal)">{current ?? "–"}</span>
      {best !== undefined ? (
        <>
          <span className="h-3.5 w-px bg-(--hairline)" aria-hidden="true" />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Best</span>
          <span className="text-sm font-bold tabular-nums text-(--text)">{best}</span>
        </>
      ) : null}
    </button>
  );
}

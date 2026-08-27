"use client";

import { type GuessRecord } from "@/hooks/useMelodleGame";

type Props = {
  guesses: GuessRecord[];
  currentAttempt: number; // 1-indexed
  /// Game.maxAttempts, from the server — not a client-side constant.
  maxAttempts: number;
};

export function AttemptTimeline({ guesses, currentAttempt, maxAttempts }: Props) {
  return (
    <section aria-labelledby="attempts-label">
      <div className="mb-2 flex items-center justify-between">
        <p id="attempts-label" className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">
          Attempts
        </p>
        <p className="text-xs text-(--text-dim)">
          {Math.max(0, maxAttempts - guesses.length)} left
        </p>
      </div>
      <ol className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: maxAttempts }, (_, i) => {
          const record = guesses[i];
          const isCurrent = !record && i + 1 === currentAttempt;

          let content: string = String(i + 1);
          let label = `Attempt ${i + 1}, unused`;
          let border = "var(--hairline)";
          let color = "var(--text-faint)";
          let background = "transparent";

          if (record?.pending) {
            // Claimed the instant the player submitted, before the server has
            // ruled. Shown as in-flight rather than as a miss — the slot is
            // certainly spent, but the verdict genuinely isn't known yet.
            content = "•••";
            label = `Attempt ${i + 1}, submitted`;
            border = "var(--signal)";
            color = "var(--text-dim)";
            background = "color-mix(in srgb, var(--signal) 6%, transparent)";
          } else if (record?.correct) {
            content = "OK";
            label = `Attempt ${i + 1}, correct`;
            border = "var(--success)";
            color = "var(--success)";
            background = "color-mix(in srgb, var(--success) 12%, transparent)";
          } else if (record?.skipped) {
            content = "SKIP";
            label = `Attempt ${i + 1}, skipped`;
            color = "var(--text)";
            background = "var(--surface-hover)";
          } else if (record) {
            content = "MISS";
            label = `Attempt ${i + 1}, incorrect`;
            border = "var(--miss)";
            color = "var(--miss)";
            background = "color-mix(in srgb, var(--miss) 10%, transparent)";
          } else if (isCurrent) {
            label = `Attempt ${i + 1}, current`;
            border = "var(--signal)";
            color = "var(--text)";
            background = "color-mix(in srgb, var(--signal) 10%, transparent)";
          }

          return (
            <li
              key={i}
              className="flex h-9 items-center justify-center rounded-[4px] border font-mono text-[10px] font-semibold transition-colors duration-200 sm:text-xs"
              style={{ borderColor: border, color, background }}
              aria-label={label}
              aria-current={isCurrent ? "step" : undefined}
            >
              {content}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

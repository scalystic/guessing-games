"use client";

import { type GuessRecord } from "@/hooks/useMelodleGame";

type Props = {
  guesses: GuessRecord[];
  currentAttempt: number; // 1-indexed
  /// Game.maxAttempts, from the server — not a client-side constant.
  maxAttempts: number;
};

export function AttemptTimeline({ guesses, currentAttempt, maxAttempts }: Props) {
  const activeAttempt = Math.min(currentAttempt, maxAttempts);

  return (
    <section className="flex min-w-0 items-center gap-3 sm:gap-5" aria-labelledby="attempts-label">
      <p
        id="attempts-label"
        className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9299ad] sm:text-[10px]"
      >
        Attempt <span className="text-[#f2e9d8]">{activeAttempt}</span> of {maxAttempts}
      </p>
      <ol className="flex items-center gap-2" aria-label={`${Math.max(0, maxAttempts - guesses.length)} attempts left`}>
        {Array.from({ length: maxAttempts }, (_, i) => {
          const record = guesses[i];
          const isCurrent = !record && i + 1 === currentAttempt;

          let label = `Attempt ${i + 1}, unused`;
          let stateClass = "border-[#677086] bg-[#677086]";

          if (record?.pending) {
            label = `Attempt ${i + 1}, submitted`;
            stateClass = "border-(--signal) bg-(--signal) animate-pulse shadow-[0_0_8px_rgba(242,184,75,0.45)]";
          } else if (record?.correct) {
            label = `Attempt ${i + 1}, correct`;
            stateClass = "border-(--success) bg-(--success) shadow-[0_0_8px_color-mix(in_srgb,var(--success)_55%,transparent)]";
          } else if (record?.skipped) {
            label = `Attempt ${i + 1}, skipped`;
            stateClass = "border-(--signal) bg-transparent shadow-[inset_0_0_0_2px_#171b2b]";
          } else if (record) {
            label = `Attempt ${i + 1}, incorrect`;
            stateClass = "border-(--miss) bg-(--miss)";
          } else if (isCurrent) {
            label = `Attempt ${i + 1}, current`;
            stateClass = "border-(--signal) bg-(--signal) shadow-[0_0_8px_rgba(242,184,75,0.4)]";
          }

          return (
            <li
              key={i}
              className={`h-2 w-2 rounded-full border transition-all duration-300 ${stateClass}`}
              aria-label={label}
              aria-current={isCurrent ? "step" : undefined}
            />
          );
        })}
      </ol>
    </section>
  );
}

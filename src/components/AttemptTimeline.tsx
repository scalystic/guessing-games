"use client";

import { MAX_ATTEMPTS, type GuessRecord } from "@/hooks/useMelodleGame";

type Props = {
  guesses: GuessRecord[];
  currentAttempt: number; // 1-indexed
  accent: string;
};

export function AttemptTimeline({ guesses, currentAttempt, accent }: Props) {
  return (
    <div className="flex w-full gap-1.5">
      {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
        const record = guesses[i];
        const isCurrent = !record && i + 1 === currentAttempt;

        let content: string = String(i + 1);
        let bg = "var(--surface-hover)";
        let color = "var(--text-dim)";
        // A skip is a used, spent attempt — it should read as "done", not
        // as equally available as an upcoming slot, even though neither
        // has its own bright color the way correct/wrong do.
        let usedUp = false;

        if (record?.correct) {
          content = "✓";
          bg = "#6ba385";
          color = "#0d211a";
        } else if (record?.skipped) {
          content = "»";
          usedUp = true;
        } else if (record) {
          content = "✕";
          bg = "#c17a6b";
          color = "#2b1512";
        } else if (isCurrent) {
          bg = accent;
          color = "#000";
        }

        return (
          <div
            key={i}
            className="flex h-8 flex-1 items-center justify-center rounded-full text-xs font-bold transition-all duration-300"
            style={{
              background: bg,
              color,
              opacity: usedUp ? 0.45 : 1,
              border: usedUp ? "none" : "1px solid var(--hairline)",
              boxShadow: isCurrent ? `0 0 10px ${accent}` : "none",
            }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

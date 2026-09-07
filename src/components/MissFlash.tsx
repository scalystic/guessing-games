"use client";

import { useEffect } from "react";
import type { MissFeedback } from "@/hooks/useMelodleGame";

/// Kept in step with the exit animation in globals.css (`.miss-flash`), which
/// fades the card out over the last 350ms of this.
const VISIBLE_MS = 2550;

function formatSeconds(milliseconds: number) {
  const seconds = milliseconds / 1000;
  return seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}

/// The answer to "what just happened?" after a wrong guess.
///
/// A miss used to be announced only by a slot in the attempts row turning red
/// and reading MISS, four lines below where the player was looking — while the
/// guess box cleared itself, which reads far more like the app dropped the
/// input than like a verdict. This says what was guessed, that it was wrong,
/// and what the miss bought.
export function MissFlash({
  feedback,
  onDone,
}: {
  feedback: MissFeedback | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(onDone, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [feedback, onDone]);

  if (!feedback) return null;

  const outOfAttempts = feedback.attemptsRemaining <= 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-30 flex justify-center px-4"
      role="status"
      aria-live="assertive"
    >
      <div
        // Keyed on the miss id so a second wrong guess replays the animation
        // instead of sitting there already-animated.
        key={feedback.id}
        className="miss-flash flex max-w-[22rem] items-center gap-3 rounded-[10px] border px-4 py-3 shadow-2xl backdrop-blur-md"
        style={{
          borderColor: "color-mix(in srgb, var(--miss) 45%, transparent)",
          background: "color-mix(in srgb, var(--miss) 14%, var(--surface-strong))",
        }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--miss) 22%, transparent)", color: "var(--miss)" }}
          aria-hidden="true"
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
            <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
          </svg>
        </span>

        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--miss)" }}>
            Wrong guess
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-(--text)">
            Not {feedback.guessed.title}
          </p>
          <p className="mt-0.5 text-xs text-(--text-dim)">
            {outOfAttempts
              ? "No attempts left."
              : `${
                  feedback.unlockedMs !== null ? `${formatSeconds(feedback.unlockedMs)}s unlocked · ` : ""
                }${feedback.attemptsRemaining} ${feedback.attemptsRemaining === 1 ? "attempt" : "attempts"} left`}
          </p>
        </div>
      </div>
    </div>
  );
}

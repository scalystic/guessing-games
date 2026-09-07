"use client";

import { useEffect } from "react";

/// A run that never started has nothing behind it — no tape, no waveform, no
/// guess box. An inline banner would sit above a dead deck and read as a
/// warning the player can ignore, so terminal failures get the modal instead.
/// Mid-run failures (a guess that didn't go through) stay inline, where the
/// board is still live and worth looking at.
export function RunErrorDialog({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--scrim) p-4"
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="run-error-title"
      aria-describedby="run-error-message"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="panel-in w-full max-w-sm rounded-[14px] border border-(--hairline) bg-(--surface-strong) p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 shrink-0 text-(--miss)"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M10 3l7 13H3L10 3z" strokeLinejoin="round" />
              <path d="M10 7.2v4.4M10 14.2h.01" strokeLinecap="round" />
            </svg>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--miss)">
                Nothing to play
              </p>
              <h2
                id="run-error-title"
                className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-none text-(--text)"
              >
                Couldn&apos;t start a run.
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--hairline) text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p id="run-error-message" className="mt-4 text-sm leading-6 text-(--text-dim)">
          {message}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-11 w-full rounded-[7px] bg-(--signal) py-2.5 text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

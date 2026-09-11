"use client";

import { useEffect, useId, type ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, onClose, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-(--scrim) p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Capped and column-flexed so a tall body scrolls INSIDE the card
          instead of running off the bottom of the viewport. The title row and
          the Close button stay pinned; only the middle scrolls, so a long panel
          never strands the player with no visible way out. dvh, not vh —
          mobile browser chrome makes vh taller than the space actually on
          screen, which is exactly the case that overflowed. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col rounded-[12px] border border-(--hairline) bg-(--surface-strong) p-5 shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <h2 id={titleId} className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-none text-(--text)">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--hairline) text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
            aria-label={`Close ${title}`}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* min-h-0 is load-bearing: without it a flex child refuses to shrink
            below its content height and overflow-y never engages. */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-11 w-full shrink-0 rounded-[7px] bg-(--signal) py-2.5 text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

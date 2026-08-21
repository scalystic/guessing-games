"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  accent: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, accent, onClose, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-(--scrim) p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border p-5"
        style={{ borderColor: `${accent}30`, background: "var(--surface-strong)" }}
      >
        <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
          {title}
        </p>
        <div className="mt-3">{children}</div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-black transition hover:scale-[1.02] active:scale-95"
          style={{ background: accent }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

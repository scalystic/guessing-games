"use client";

import { useSyncExternalStore } from "react";
import {
  getServerThemeMode,
  getThemeMode,
  setThemeMode,
  subscribeThemeMode,
} from "@/lib/theme-mode";

export function ThemeModeToggle() {
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeMode, getServerThemeMode);
  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={() => setThemeMode(isDark ? "light" : "dark")}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-(--hairline) bg-(--surface) text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M16 12.8A6.5 6.5 0 0 1 7.2 4a6.5 6.5 0 1 0 8.8 8.8z" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="10" cy="10" r="3.2" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

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
      className="flex h-12 w-12 items-center justify-center rounded-full border border-(--hairline) bg-(--surface) text-lg transition hover:scale-105 hover:bg-(--surface-hover) active:scale-95"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? "🌙" : "☀️"}
    </button>
  );
}

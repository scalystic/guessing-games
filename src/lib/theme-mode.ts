"use client";

// A minimal external store around the `dark` class on <html>, which the
// blocking script in layout.tsx already sets before first paint. Reading
// getServerThemeMode's fixed value during hydration and the real DOM class
// afterward is exactly what useSyncExternalStore's split is for — no
// setState-in-effect flash, no server/client mismatch.

const STORAGE_KEY = "sargam-theme-mode";
export type ThemeModeValue = "light" | "dark";

let listeners: Array<() => void> = [];

export function getThemeMode(): ThemeModeValue {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function getServerThemeMode(): ThemeModeValue {
  return "dark";
}

export function subscribeThemeMode(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function setThemeMode(mode: ThemeModeValue) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private browsing / storage disabled — the toggle still works for
    // this tab, it just won't be remembered next visit.
  }
  listeners.forEach((l) => l());
}

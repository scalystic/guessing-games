"use client";

// A minimal external store around the player's chosen accent theme, mirroring
// theme-mode.ts's pattern so the choice persists across pages (including the
// server-rendered auth pages) instead of living only in one component's
// React state.

import { THEMES, DEFAULT_THEME, type GameTheme } from "@/data/themes";

const STORAGE_KEY = "sargam-theme-color";

let current: GameTheme = DEFAULT_THEME;
let hydrated = false;
let listeners: Array<() => void> = [];

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const match = saved && THEMES.find((t) => t.name === saved);
    if (match) current = match;
  } catch {
    // Private browsing / storage disabled — falls back to the default.
  }
}

export function getThemeColor(): GameTheme {
  hydrate();
  return current;
}

export function getServerThemeColor(): GameTheme {
  return DEFAULT_THEME;
}

export function subscribeThemeColor(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function setThemeColor(theme: GameTheme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme.name);
  } catch {
    // Private browsing / storage disabled — the choice still applies for
    // this tab, it just won't be remembered next visit.
  }
  listeners.forEach((l) => l());
}

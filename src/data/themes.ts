export type GameTheme = { name: string; from: string; to: string; solid: string };

// Jewel-tone palette pulled from film-poster & festival colors (marigold,
// vermillion, peacock, gulaal, royal) — desaturated toward a muted, dusty
// register so the accent reads as a considered brand color rather than a
// neon "generated UI" gradient. Shared by the in-game theme switcher and the
// auth pages, via the persisted choice in @/lib/theme-color.
export const THEMES: GameTheme[] = [
  { name: "Marigold", from: "#cf9c4e", to: "#9a5138", solid: "#cf9c4e" },
  { name: "Sindoor", from: "#c17a6b", to: "#d1ab5e", solid: "#c17a6b" },
  { name: "Peacock", from: "#3d7d74", to: "#c9a55c", solid: "#5aa89c" },
  { name: "Gulaal", from: "#b06c88", to: "#d1ab5e", solid: "#c087a0" },
  { name: "Royal", from: "#3d477c", to: "#c9a55c", solid: "#6c76ab" },
];

export const DEFAULT_THEME = THEMES[0];

"use client";

export type { GameTheme } from "@/data/themes";
import type { GameTheme } from "@/data/themes";

type Props = {
  themes: GameTheme[];
  active: GameTheme;
  onChange: (theme: GameTheme) => void;
  onShuffle?: () => void;
};

// Shared by the profile menu and the Settings panel, so the swatch grid
// never drifts out of sync between the two places it shows.
export function ThemeSwatchGrid({ themes, active, onChange, onShuffle }: Props) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {themes.map((t) => {
          const isActive = t.name === active.name;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => onChange(t)}
              className="group flex flex-col items-center gap-1"
              aria-label={t.name}
              aria-pressed={isActive}
            >
              <span
                className="h-8 w-8 rounded-full transition-transform group-hover:scale-110"
                style={{
                  background: `linear-gradient(135deg, ${t.from}, ${t.to})`,
                  boxShadow: isActive ? `0 0 0 2px var(--surface-strong), 0 0 0 4px ${t.solid}` : "none",
                  transform: isActive ? "scale(1.12)" : "scale(1)",
                }}
              />
            </button>
          );
        })}
      </div>
      {onShuffle && (
        <button
          type="button"
          onClick={onShuffle}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-(--hairline) py-2 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
        >
          🎲 Surprise me
        </button>
      )}
    </div>
  );
}

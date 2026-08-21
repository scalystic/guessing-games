"use client";

export type NavItem = {
  key: string;
  label: string;
  icon: string;
  soon?: boolean;
};

export const SIDEBAR_ITEMS: NavItem[] = [
  { key: "play", label: "Play", icon: "🎧" },
  { key: "stats", label: "My Stats", icon: "📊" },
  { key: "help", label: "How to Play", icon: "ℹ️" },
  { key: "settings", label: "Settings", icon: "⚙️" },
  { key: "daily", label: "Daily Hit", icon: "🎯" },
  { key: "challenge", label: "Challenge", icon: "⏱️" },
  { key: "leaderboard", label: "Leaderboard", icon: "🏆" },
  { key: "achievements", label: "Achievements", icon: "🎖️" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  accent: string;
  gradientFrom: string;
  gradientTo: string;
  streak: number;
  roundsSolved: number;
  onSelect: (key: string) => void;
  onPlayNow: () => void;
};

// A closed-by-default drawer, not a permanent column — "Play" is the only
// real destination right now; everything else opens a modal over the same
// screen (Stats/Help/Settings) or is an honest "Soon" placeholder rather
// than a link to a page that doesn't exist yet.
export function Sidebar({
  open,
  onClose,
  accent,
  gradientFrom,
  gradientTo,
  streak,
  roundsSolved,
  onSelect,
  onPlayNow,
}: Props) {
  function selectAndClose(key: string) {
    onSelect(key);
    onClose();
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-(--scrim) backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-4 overflow-y-auto border-r border-(--hairline) bg-(--surface-strong) p-5 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-label="Menu"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between">
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">Menu</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-(--text-dim) transition hover:bg-(--surface-hover)"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = item.key === "play";
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => selectAndClose(item.key)}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-(--surface-hover) ${
                  item.soon ? "border border-dashed border-(--hairline)" : "border border-transparent"
                }`}
                style={{
                  background: isActive ? accent : "transparent",
                  color: isActive ? "#000" : item.soon ? "var(--text-faint)" : "var(--text-dim)",
                }}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-base" style={{ opacity: item.soon ? 0.55 : 1 }}>
                    {item.icon}
                  </span>
                  {item.label}
                </span>
                {item.soon && (
                  <span
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide"
                    style={{
                      background: `${accent}22`,
                      border: `1px solid ${accent}55`,
                      color: accent,
                    }}
                  >
                    🔒 Coming Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div
          className="rounded-2xl p-4 text-white shadow-lg"
          style={{ background: `linear-gradient(160deg, ${gradientFrom}, ${gradientTo})` }}
        >
          <span className="text-2xl" aria-hidden="true">
            🎬
          </span>
          <p className="mt-2 font-[family-name:var(--font-display)] text-base font-bold">
            Keep the Streak Alive
          </p>
          <p className="mt-1 text-xs text-white/80">
            {roundsSolved > 0
              ? `You've solved ${roundsSolved} song${roundsSolved === 1 ? "" : "s"} this session.`
              : "Guess your first song to start a streak!"}
            {streak > 0 && ` Current streak: ${streak}🔥`}
          </p>
          <button
            type="button"
            onClick={() => {
              onPlayNow();
              onClose();
            }}
            className="mt-3 w-full rounded-xl bg-white/95 py-2 text-sm font-semibold text-black transition hover:bg-white"
          >
            Play Now
          </button>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/get-current-user";
import { logout } from "@/lib/auth/actions";
import { ThemeModeToggle } from "./ThemeModeToggle";

function MenuBarsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
    </svg>
  );
}

function MultiplayerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="6.5" cy="7" r="2.3" />
      <circle cx="14" cy="7" r="2.3" />
      <path d="M2.5 16c.5-2.6 2.1-4 4-4s3.5 1.4 4 4M10.5 16c.4-2.2 1.8-3.4 3.5-3.4s3.1 1.2 3.5 3.4" strokeLinecap="round" />
    </svg>
  );
}

function ChallengeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M7 2v4M13 2v4M3 9h14" strokeLinecap="round" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 16V9m6 7V4m6 12v-5" strokeLinecap="round" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.9 7.6a2.2 2.2 0 0 1 4.3.7c0 1.8-2.2 1.9-2.2 3.4M10 14.7h.01" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 9L10 3.5 16.5 9M5.5 8v8h9V8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 9h14M7 2v3M13 2v3" strokeLinecap="round" />
      <path d="M6.5 12.5h1.2M9.4 12.5h1.2M12.3 12.5h1.2" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = {
  multiplayer: <MultiplayerIcon />,
  daily: <ChallengeIcon />,
  stats: <StatsIcon />,
  help: <HelpIcon />,
  home: <HomeIcon />,
  calendar: <CalendarIcon />,
} as const;

export type GameMenuItem = {
  icon: keyof typeof ICONS;
  label: string;
  hint: string;
  /// Exactly one of these — `href` renders a Link, `onClick` a button.
  onClick?: () => void;
  href?: string;
  badge?: string;
  primary?: boolean;
  /// Renders the row greyed out and inert — still listed so players know the
  /// mode exists, but it can't be opened. Suppresses `href`/`onClick` entirely
  /// rather than relying on styling, so keyboard and screen-reader users hit
  /// the same wall as mouse users.
  disabled?: boolean;
};

const ROW_CLASS = "flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition-colors duration-200";

function MenuRow({
  icon,
  label,
  hint,
  onClick,
  href,
  badge,
  primary,
  disabled,
}: GameMenuItem & { onClick?: () => void }) {
  const className = `${ROW_CLASS} ${
    disabled
      ? "cursor-not-allowed text-(--text-faint) opacity-60"
      : primary
        ? "bg-(--signal) text-(--signal-ink) hover:bg-[#ffd071]"
        : "text-(--text-dim) hover:bg-(--surface-hover) hover:text-(--text)"
  }`;

  const highlighted = primary && !disabled;

  const body = (
    <>
      <span className={highlighted ? "shrink-0" : "shrink-0 text-(--text-faint)"}>{ICONS[icon]}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        <span
          className={`mt-0.5 block truncate text-[11px] leading-tight ${
            highlighted ? "opacity-70" : "text-(--text-faint)"
          }`}
        >
          {hint}
        </span>
      </span>
      {badge ? (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.05em] ${
            disabled
              ? "border border-(--hairline) text-(--text-faint)"
              : "bg-(--miss) text-white"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <div className={className} aria-disabled="true">
        {body}
      </div>
    );
  }

  return href ? (
    <Link href={href} onClick={onClick} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

type Props = {
  user: CurrentUser;
  items: GameMenuItem[];
};

/// Everything that used to be a separate pill in the game header — daily,
/// stats, how-to-play, multiplayer, account — behind one trigger. The header
/// row is narrow on phones and five buttons deep was the whole problem, so the
/// only thing left up there is this button. Both game screens (practice and
/// daily) render this same menu; only `items` differs.
export function GameMenu({ user, items }: Props) {
  const [open, setOpen] = useState(false);
  const [isLoggingOut, startLogout] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const isGuest = !user || user.kind === "GUEST";

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  /// Every row both fires its action and dismisses the menu — none of these
  /// open anything that lives inside the panel.
  function pick(action: () => void) {
    return () => {
      setOpen(false);
      action();
    };
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 items-center gap-2 rounded-full border border-(--hairline) bg-(--surface) px-3.5 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
        aria-label="Menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <MenuBarsIcon />
        <span className="hidden sm:inline">Menu</span>
        {/* Multiplayer used to carry its own "New" badge out here; a dot keeps
            that discoverability without a second button. Disabled rows are
            skipped — a coming-soon mode is not something to ping about. */}
        {items.some((item) => item.badge && !item.disabled) ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-(--miss)" aria-hidden="true" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[268px] rounded-[10px] border border-(--hairline) bg-(--surface-strong) p-3 shadow-2xl shadow-black/25">
          <div className="px-1 pb-2.5">
            <p className="truncate text-sm font-semibold text-(--text)">
              {isGuest ? "Guest session" : (user.displayName ?? "Player")}
            </p>
            <p className="mt-0.5 text-[11px] text-(--text-faint)">
              {isGuest ? "Progress stays on this device." : "Your progress is synced."}
            </p>
          </div>

          <div className="space-y-1 border-t border-(--hairline) pt-2.5">
            {items.map((item) => (
              <MenuRow
                key={item.label}
                {...item}
                onClick={item.onClick ? pick(item.onClick) : () => setOpen(false)}
              />
            ))}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-(--hairline) px-1 pt-2.5">
            <p className="text-sm text-(--text-dim)">Appearance</p>
            <ThemeModeToggle />
          </div>

          {isGuest ? (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-[6px] border border-(--hairline) px-3 py-2.5 text-center text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover)"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="rounded-[6px] bg-(--signal) px-3 py-2.5 text-center text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
              >
                Sign up
              </Link>
            </div>
          ) : (
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={() => startLogout(() => logout())}
              className="mt-2.5 w-full rounded-[6px] border border-(--hairline) px-3 py-2.5 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text) disabled:opacity-50"
            >
              {isLoggingOut ? "Logging out…" : "Log out"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

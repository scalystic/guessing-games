"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/get-current-user";
import { logout } from "@/lib/auth/actions";
import { ThemeSwatchGrid, type GameTheme } from "./ThemeSwatchGrid";
import { ThemeModeToggle } from "./ThemeModeToggle";

type Props = {
  accent: string;
  themes: GameTheme[];
  activeTheme: GameTheme;
  onThemeChange: (theme: GameTheme) => void;
  user: CurrentUser;
};

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <circle cx="10" cy="6.5" r="3.5" />
      <path d="M3 17c0-3.6 3.1-6 7-6s7 2.4 7 6v.5H3V17z" />
    </svg>
  );
}

export function ProfileMenu({ accent, themes, activeTheme, onThemeChange, user }: Props) {
  const [open, setOpen] = useState(false);
  const [isLoggingOut, startLogout] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const isGuest = !user || user.kind === "GUEST";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function shuffleTheme() {
    const others = themes.filter((t) => t.name !== activeTheme.name);
    const pick = others[Math.floor(Math.random() * others.length)] ?? themes[0];
    onThemeChange(pick);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-12 items-center justify-center rounded-full text-black shadow-md transition hover:scale-105 active:scale-95"
        style={{ background: accent }}
        aria-label="Account menu"
      >
        <UserIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-[#cf9c4e]/15 bg-(--surface-strong) p-3 shadow-2xl shadow-black/30 backdrop-blur-xl dark:shadow-black/60">
          <div className="flex items-center gap-3 border-b border-(--hairline) pb-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black"
              style={{ background: accent }}
            >
              <UserIcon />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-(--text)">
                {isGuest ? "Guest player" : user.displayName ?? "Player"}
              </p>
              <p className="truncate text-xs text-(--text-faint)">
                {isGuest ? "Progress saved on this device" : "Signed in"}
              </p>
            </div>
          </div>

          <div className="border-b border-(--hairline) py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-(--text-faint)">
              Theme color
            </p>
            <ThemeSwatchGrid themes={themes} active={activeTheme} onChange={onThemeChange} onShuffle={shuffleTheme} />
          </div>

          <div className="flex items-center justify-between border-b border-(--hairline) py-3">
            <p className="text-sm text-(--text-dim)">Appearance</p>
            <ThemeModeToggle />
          </div>

          {isGuest ? (
            <div className="mt-3 flex gap-2">
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl py-2.5 text-center text-sm font-semibold text-black transition"
                style={{ background: accent }}
              >
                Sign up
              </Link>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-(--hairline) bg-(--surface) py-2.5 text-center text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
              >
                Log in
              </Link>
            </div>
          ) : (
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={() => startLogout(() => logout())}
              className="mt-3 w-full rounded-xl border border-(--hairline) bg-(--surface) py-2.5 text-center text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover) hover:text-(--text) disabled:opacity-50"
            >
              {isLoggingOut ? "Logging out…" : "Log out"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

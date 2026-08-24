"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/get-current-user";
import { logout } from "@/lib/auth/actions";
import { ThemeModeToggle } from "./ThemeModeToggle";

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="6.5" r="3.5" />
      <path d="M3 17c0-3.6 3.1-6 7-6s7 2.4 7 6v.5H3V17z" />
    </svg>
  );
}

export function ProfileMenu({ user }: { user: CurrentUser }) {
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
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-(--hairline) bg-(--surface) text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <UserIcon />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-[10px] border border-(--hairline) bg-(--surface-strong) p-4 shadow-2xl shadow-black/25">
          <div className="border-b border-(--hairline) pb-3">
            <p className="truncate text-sm font-semibold text-(--text)">
              {isGuest ? "Guest session" : user.displayName ?? "Player"}
            </p>
            <p className="mt-1 text-xs text-(--text-faint)">
              {isGuest ? "Progress stays on this device." : "Your progress is synced."}
            </p>
          </div>

          <div className="flex items-center justify-between border-b border-(--hairline) py-3">
            <p className="text-sm text-(--text-dim)">Appearance</p>
            <ThemeModeToggle />
          </div>

          {isGuest ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
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
              className="mt-3 w-full rounded-[6px] border border-(--hairline) px-3 py-2.5 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text) disabled:opacity-50"
            >
              {isLoggingOut ? "Logging out…" : "Log out"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

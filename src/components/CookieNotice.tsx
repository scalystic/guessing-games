"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEY = "cluecade-cookie-notice";

// A minimal external store, mirroring the pattern in lib/theme-mode.ts and
// lib/theme-color.ts: localStorage is the external system, and reading it
// through useSyncExternalStore keeps the server snapshot ("dismissed", so the
// bar is never in the server HTML) separate from the client one — which is what
// stops the notice flashing at people who dismissed it months ago.
let dismissed: boolean | null = null;
let listeners: Array<() => void> = [];

function isDismissed(): boolean {
  if (dismissed === null) {
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      // Private mode with storage disabled. Treating it as dismissed is the
      // kinder failure: the alternative shows the bar on every single page
      // load, and the Cookie Policy stays linked in the footer regardless.
      dismissed = true;
    }
  }
  return dismissed;
}

function isDismissedOnServer(): boolean {
  return true;
}

function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function dismiss() {
  dismissed = true;
  try {
    localStorage.setItem(STORAGE_KEY, "seen");
  } catch {
    // Nothing to do — it reappears next visit, which is harmless.
  }
  listeners.forEach((l) => l());
}

/// A notice, not a consent gate — and the difference is deliberate.
///
/// Cluecade sets only strictly-necessary cookies (session, guest identity,
/// OAuth state) plus preferences the user chose themselves. None of that needs
/// consent, so offering an "accept / reject" choice would be theatre: rejecting
/// would have to break sign-in to mean anything. What the law does expect is
/// that we tell people, clearly, what is stored and why.
///
/// The moment any analytics or advertising technology is added, this component
/// is no longer sufficient — it has to become a real consent mechanism that
/// blocks those cookies until the user opts in, and the Cookie Policy has to
/// say so. See src/app/legal/cookies/page.tsx, section 3.
export function CookieNotice() {
  const hidden = useSyncExternalStore(
    subscribe,
    isDismissed,
    isDismissedOnServer,
  );

  if (hidden) return null;

  return (
    <div
      // Not role="dialog": it traps nothing and blocks nothing. A labelled
      // region announces it without yanking focus out of a game in progress.
      role="region"
      aria-label="Cookie notice"
      className="panel-in fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-(--hairline) bg-(--surface-strong) p-4 shadow-2xl shadow-black/20 sm:inset-x-6 dark:shadow-black/50"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <p className="text-sm text-(--text-dim)">
          Cluecade uses only essential cookies — to keep you signed in and to
          save your game in progress. No analytics, no ads, no tracking.{" "}
          <Link
            href="/legal/cookies"
            className="text-(--text) underline decoration-(--signal) underline-offset-4"
          >
            Cookie Policy
          </Link>
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full bg-(--signal) px-4 py-2 text-sm font-medium text-(--signal-ink) transition-opacity hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

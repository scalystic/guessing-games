"use client";

import Link from "next/link";

/// Stands where the leaderboard goes, for anyone who can't be put on a board
/// under a name of their own.
///
/// Two cases, one component:
///
///   - a guest, who needs an account
///   - an account that hasn't claimed a username yet (every Google sign-in
///     starts here, and so does every account created before usernames)
///
/// Scoped to the leaderboard on purpose. The score and the share poster above
/// this stay visible to everyone: the poster is the daily's word-of-mouth
/// loop, and a guest who just finished should still be able to send it to
/// someone. Only the board — the one thing that is inherently about being
/// named among other named people — needs the account.
///
/// `next` carries the player back here afterwards, so signing in from the end
/// of a run returns to the result rather than the top of the game.
export function LeaderboardGate({
  reason,
  next = "/sargam",
}: {
  reason: "guest" | "no-username";
  next?: string;
}) {
  const needsUsername = reason === "no-username";

  return (
    <div className="w-full max-w-sm rounded-[14px] border border-(--hairline) bg-(--surface-strong) p-6 text-center shadow-xl">
      <div
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-(--hairline) bg-(--surface)"
        aria-hidden="true"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--signal)" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 16V9m6 7V4m6 12v-5" strokeLinecap="round" />
        </svg>
      </div>

      <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--signal)">
        Today&apos;s Leaderboard
      </p>
      <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight text-(--text)">
        {needsUsername ? "Pick a username to appear" : "See where you placed"}
      </h3>
      <p className="mt-2 text-sm leading-6 text-(--text-dim)">
        {needsUsername
          ? "Your account needs a public username before it can go on the board. It takes one step."
          : "The leaderboard is for named players. Create an account to see today's standings and claim your spot on them."}
      </p>

      {needsUsername ? (
        <Link
          href={`/username?next=${encodeURIComponent(next)}`}
          className="mt-5 block w-full rounded-xl bg-(--signal) px-4 py-3 text-center text-sm font-bold text-(--signal-ink) shadow-sm transition hover:bg-[#ffd071]"
        >
          Pick my username
        </Link>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="rounded-xl border border-(--hairline) px-3 py-3 text-center text-sm font-semibold text-(--text-dim) transition hover:bg-(--surface-hover) hover:text-(--text)"
            >
              Log in
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(next)}`}
              className="rounded-xl bg-(--signal) px-3 py-3 text-center text-sm font-bold text-(--signal-ink) shadow-sm transition hover:bg-[#ffd071]"
            >
              Sign up
            </Link>
          </div>
          {/* The one thing worth saying to a guest at this exact moment: the
              run they just played is not lost by signing up, it moves across
              (see lib/auth/merge-guest.ts). */}
          <p className="mt-3 text-xs leading-5 text-(--text-faint)">
            Today&apos;s result and your streak come with you.
          </p>
        </>
      )}
    </div>
  );
}

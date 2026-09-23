import type { Metadata } from "next";
import Link from "next/link";
import { GameHeader } from "@/components/GameHeader";

/// The daily challenge is built — fixed set, once a day, streaks, its own
/// leaderboard — see daily-client.tsx next to this file. It's held back while
/// /sargam ships as the unlimited run instead, so this route is a static
/// "coming soon" screen rather than the real game.
///
/// noindex: nothing here is playable yet, so there's nothing worth a search
/// result landing on. Re-indexed the same way /sargam/page.tsx is once this
/// flips back on.
///
/// To relaunch: swap the body below for
/// `<DailyClient user={user} game={game} />`, the way /sargam/page.tsx
/// renders practice-client.tsx today — see that file for the
/// getCurrentUser()/getActiveGameBySlug() + JsonLd wiring this will need back.
export const metadata: Metadata = {
  title: "Daily Challenge — Coming Soon",
  description:
    "Sargam's daily challenge is on its way — one set, every player, every day. Play the unlimited run at /sargam in the meantime.",
  robots: { index: false, follow: false },
} satisfies Metadata;

export default function Page() {
  return (
    <div className="page-backdrop min-h-full text-(--text)">
      <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 pb-12 pt-3.5 sm:px-6 sm:pb-16 sm:pt-5">
        <GameHeader subtitle="Daily challenge" accentSubtitle>
          <Link
            href="/sargam"
            className="flex h-10 items-center gap-2 rounded-full border border-(--hairline) bg-(--surface) px-3.5 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
          >
            Play Sargam
          </Link>
        </GameHeader>

        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--signal)">
            Coming Soon
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight text-(--text)">
            The daily challenge is on its way.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-(--text-dim)">
            One set, every player, every day. While we finish it up, play the
            unlimited run — pick an era and go as long as you like.
          </p>
          <Link
            href="/sargam"
            className="mt-6 rounded-xl bg-(--signal) px-5 py-3 text-center text-sm font-bold text-(--signal-ink) shadow-sm transition hover:bg-[#ffd071]"
          >
            Play Sargam
          </Link>
        </div>
      </div>
    </div>
  );
}

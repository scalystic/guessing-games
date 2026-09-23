import type { Metadata } from "next";
import Link from "next/link";
import { GameHeader } from "@/components/GameHeader";
import { StatsLeaderboard } from "@/components/StatsLeaderboard";

/// The catalog row this board is scoped to — same game /sargam plays. See the
/// note on GAME_SLUG in sargam/page.tsx: the URL says "sargam", the Game
/// record says "songless".
const GAME_SLUG = "songless";

/// noindex: this is a live, personalized read (it carries the viewer's own
/// rank when they're off the visible page), not marketing copy — same
/// treatment as /login and /multiplayer/room/[code].
export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Ranked by how many songs were named within the first 0.4 seconds of the clip.",
  robots: { index: false, follow: false },
} satisfies Metadata;

export default function Page() {
  return (
    <div className="page-backdrop min-h-full text-(--text)">
      <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 pb-12 pt-3.5 sm:px-6 sm:pb-16 sm:pt-5">
        <GameHeader subtitle="All-time leaderboard" accentSubtitle>
          <Link
            href="/sargam"
            className="flex h-10 items-center gap-2 rounded-full border border-(--hairline) bg-(--surface) px-3.5 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
          >
            Play Sargam
          </Link>
        </GameHeader>

        <div className="mt-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--signal)">
            Leaderboard
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight text-(--text)">
            Fastest ears in Sargam
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-(--text-dim)">
            Ranked by songs named in the reveal ladder&apos;s first 0.4-second
            clip — ties broken by total correct guesses, then total songs
            played.
          </p>
        </div>

        <div className="mt-6">
          <StatsLeaderboard gameSlug={GAME_SLUG} />
        </div>
      </div>
    </div>
  );
}

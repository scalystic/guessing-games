import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveGameBySlug } from "@/lib/games";
import Practice from "./practice-client";

/// The catalog row behind this route — same one /sargam plays. See the note
/// there: the URL says "sargam", the Game record says "songless".
const GAME_SLUG = "songless";

/// The unlimited practice run — pick an era, play rounds until you stop.
///
/// This is a testing surface, not a mode we ship: /sargam is the daily
/// challenge and the only mode players are pointed at. Practice lives on
/// because it is the fastest way to exercise the engine end to end (any era,
/// as many rounds as you like, no once-a-day lock), and it still drives real
/// PRACTICE runs through /api/runs.
///
/// Kept under /sargam/testing/ so the whole branch is obviously internal, and
/// left out of the sitemap and the in-game menus. Nothing links here — you get
/// here by typing the URL.
export const metadata: Metadata = {
  title: "Practice (testing)",
  description: "Internal practice run for testing the Sargam engine.",
  // noindex rather than a robots.txt Disallow, for the reason spelled out in
  // src/app/robots.ts: a disallowed URL is never fetched, so the crawler never
  // sees the noindex and the bare URL can still surface. Allowing the fetch is
  // what lets this land. nofollow too — the links out of here are the game's
  // own, already reachable from pages we do want crawled.
  robots: { index: false, follow: false },
} satisfies Metadata;

export default async function Page() {
  const [user, game] = await Promise.all([
    getCurrentUser(),
    getActiveGameBySlug(GAME_SLUG),
  ]);

  if (!game) notFound();

  return <Practice user={user} game={game} />;
}

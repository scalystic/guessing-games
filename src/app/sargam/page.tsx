import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveGameBySlug } from "@/lib/games";
import Sargam from "./sargam-client";

/// The catalog row behind this route. The URL and the branding are "sargam";
/// the Game record is still slugged "songless" (see prisma/seed.ts), so the two
/// deliberately differ — don't "fix" one to match the other.
const GAME_SLUG = "songless";

/// Written by hand rather than derived from Game.name/tagline. Those columns are
/// operational copy ("Songless", "Name the track before the clip runs out.");
/// what a search result needs is the brand name plus the hook, and it should
/// keep rendering identically if the DB is unreachable while metadata resolves.
const TITLE = "Sargam — Guess the Song in 15 Seconds";
const DESCRIPTION =
  "Play Sargam, the fifteen-second song game. Hear a snippet of a mystery track and name it in six attempts — every skip unlocks more of the clip. Free to play in the browser, with a new daily challenge and live multiplayer rooms.";
const PATH = "/sargam";

export const metadata: Metadata = {
  // Rendered as "… · Cluecade" by the title.template in the root layout.
  title: TITLE,
  description: DESCRIPTION,
  // Relative — resolved against metadataBase (NEXT_PUBLIC_APP_URL) in the root
  // layout. Pinning it matters here because "/" redirects to this path: without
  // a canonical, crawlers that follow the redirect can still treat the two URLs
  // as competing copies of the same page.
  alternates: { canonical: PATH },
  keywords: [
    "sargam",
    "song guessing game",
    "guess the song",
    "music quiz",
    "song intro quiz",
    "name that tune",
    "daily music game",
    "bollywood song game",
  ],
  applicationName: "Cluecade",
  category: "games",
  openGraph: {
    type: "website",
    url: PATH,
    siteName: "Cluecade",
    // openGraph.title is not run through title.template, so the suffix is
    // spelled out to match what the tab and the SERP entry show.
    title: `${TITLE} · Cluecade`,
    description: DESCRIPTION,
    locale: "en_IN",
    images: [
      {
        url: "/brand/sargam-logo.png",
        width: 2048,
        height: 768,
        alt: "Sargam — the fifteen-second song game",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · Cluecade`,
    description: DESCRIPTION,
    images: ["/brand/sargam-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function Page() {
  // Read straight from the data layer rather than fetching our own API: this is
  // a server component, and an HTTP round trip to ourselves buys nothing.
  const [user, game] = await Promise.all([
    getCurrentUser(),
    getActiveGameBySlug(GAME_SLUG),
  ]);

  // Only reachable if the seed hasn't been run — better a 404 than a board
  // rendered against an undefined reveal ladder.
  if (!game) notFound();

  return <Sargam user={user} game={game} />;
}

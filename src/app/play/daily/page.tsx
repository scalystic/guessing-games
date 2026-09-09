import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveGameBySlug } from "@/lib/games";
import { SARGAM_PAGE, SITE } from "@/lib/site";
import { breadcrumbNode } from "@/lib/structured-data";
import DailyClient from "./daily-client";

const GAME_SLUG = "songless";

export const dynamic = "force-dynamic";

const PATH = "/play/daily";
const TITLE = "Daily Challenge — Today's Songs";

export const metadata: Metadata = {
  title: TITLE,
  description:
    "Today's Sargam daily challenge: ten mystery tracks, one shot each, the same set for every player. Play free in the browser and compare your score on the leaderboard.",
  alternates: { canonical: PATH },
  // "daily challenge" and "today" are the queries this page can genuinely win,
  // and it is the one URL on the site whose content is expected to change every
  // 24 hours — worth its own entry in the sitemap and its own description
  // rather than inheriting the game page's.
  keywords: [
    "daily song challenge",
    "daily music quiz",
    "song game today",
    "sargam daily",
  ],
  openGraph: {
    type: "website",
    url: PATH,
    siteName: SITE.name,
    title: `${TITLE} · ${SITE.name}`,
    description:
      "Ten mystery tracks, one shot each, the same set for every player — today only.",
    locale: SITE.locale,
    images: [SARGAM_PAGE.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · ${SITE.name}`,
    description:
      "Ten mystery tracks, one shot each, the same set for every player — today only.",
    images: [SARGAM_PAGE.ogImage.url],
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

export default async function DailyPage() {
  const [user, game] = await Promise.all([
    getCurrentUser(),
    getActiveGameBySlug(GAME_SLUG),
  ]);

  if (!game) notFound();

  return (
    <>
      {/* No VideoGame node here — the daily is a mode of Sargam, not a second
          game, and declaring it as one would split the entity in two. The
          breadcrumb is what ties this URL back to the game page. */}
      <JsonLd
        data={breadcrumbNode([
          { name: SITE.name, path: "/" },
          { name: SARGAM_PAGE.name, path: SARGAM_PAGE.path },
          { name: "Daily Challenge" },
        ])}
      />
      <DailyClient user={user} game={game} />
    </>
  );
}

/// Single source of truth for the site's own identity: where it lives, what it
/// calls itself, and the copy that search engines and social cards quote.
///
/// Everything here is safe to import from a client component — no Prisma, no
/// secrets, no Node built-ins. The metadata exports in src/app, the JSON-LD
/// builders in src/lib/structured-data.ts, robots.ts, sitemap.ts and
/// manifest.ts all read from this file so a domain change or a reworded
/// tagline is one edit, not nine.

import { OPERATOR } from "@/lib/legal";

/// The site's canonical origin, without a trailing slash.
///
/// Three sources, in descending order of trust:
///
///   1. NEXT_PUBLIC_APP_URL — set this in production. It is the only one that
///      can name a custom domain, and it is what metadataBase already used.
///   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel injects the project's stable
///      production hostname (never the per-deployment preview URL). This keeps
///      canonicals and sitemap entries pointing at production even when a
///      preview build renders them, which is exactly what you want: a preview
///      deployment must not advertise itself as the indexable copy.
///      Note it arrives bare ("example.vercel.app"), with no scheme.
///   3. localhost — development only.
///
/// Deliberately computed once at module scope. These are build-time values on
/// Vercel, and re-reading process.env per request would suggest otherwise.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

/// True only when SITE_URL names a real, publicly reachable origin.
///
/// robots.ts keys off this: a build that fell through to the localhost default
/// has no business publishing an "index everything" robots.txt, because the
/// most likely reason for the fallback is that NEXT_PUBLIC_APP_URL was never
/// set on the deployment. Failing closed there costs a config fix; failing open
/// risks getting a staging copy indexed alongside production.
export const IS_PUBLIC_SITE =
  SITE_URL.startsWith("https://") && !SITE_URL.includes("localhost");

/// Absolute URL for a site-relative path. Structured data (unlike Next's
/// Metadata type) has no metadataBase to resolve against, so every @id and
/// every image URL in JSON-LD has to be spelled out in full.
export function absoluteUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  return `${SITE_URL}${path}`;
}

export const SITE = {
  name: OPERATOR.tradeName,
  /// Shown as the site-wide fallback <title> and as og:site_name.
  tagline: "A growing arcade of quick guessing games.",
  /// The default meta description — used for "/" and anything that doesn't
  /// write its own. Kept under ~155 characters so Google shows all of it.
  description:
    "Cluecade is a free browser arcade of quick guessing games. Play Sargam, the fifteen-second song game, with a new daily challenge and live multiplayer rooms.",
  locale: "en_IN",
  lang: "en",
  /// Open Graph and Twitter both want a 1.91:1 image; these are generated from
  /// the brand mark by scripts/generate-brand-assets.ts.
  ogImage: {
    url: "/og/cluecade.png",
    width: 1200,
    height: 630,
    alt: "Cluecade — an arcade of quick guessing games",
  },
} as const;

/// The games that have a real, marketed landing page of their own.
///
/// Not derived from the Game table on purpose. That table is the *engine's*
/// catalog — it carries the "songless" slug, operational names and difficulty
/// knobs (see src/lib/games.ts) — whereas this is the list of URLs we want
/// crawled and the copy we want quoted. A row going active in the DB should
/// not silently publish a marketing page, and this list must keep resolving
/// even when Postgres is unreachable during a build.
/// Each entry is the whole SEO surface for one game: its <title>, its meta
/// description, its social card and its JSON-LD all read from here, so the
/// page and the structured data describing that page cannot drift apart.
export const GAME_PAGES = [
  {
    path: "/sargam",
    name: "Sargam",
    /// Used verbatim as the <title>, which the root layout's template renders
    /// as "… · Cluecade".
    headline: "Sargam — Guess the Song in 15 Seconds",
    description:
      "Play Sargam, the fifteen-second song game. Hear a snippet of a mystery track and name it in six attempts — every skip unlocks more of the clip. Free to play in the browser, with a new daily challenge and live multiplayer rooms.",
    ogImage: {
      url: "/og/sargam.png",
      width: 1200,
      height: 630,
      alt: "Sargam — the fifteen-second song game",
    },
    genres: ["Music", "Quiz", "Puzzle"],
    /// Not a ranking factor since ~2009 — Google ignores the keywords meta
    /// entirely. Kept because Bing and a few regional engines still read it,
    /// and because the list doubles as the checklist for what the page's own
    /// copy ought to cover.
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
  },
] as const;

/// The Sargam landing page, by name. There is exactly one game today; when
/// there are more, pages should look themselves up by path rather than index.
export const SARGAM_PAGE = GAME_PAGES[0];

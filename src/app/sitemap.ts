import type { MetadataRoute } from "next";
import { LAST_UPDATED, LEGAL_PAGES } from "@/lib/legal";
import { absoluteUrl, GAME_PAGES } from "@/lib/site";

/// Serves /sitemap.xml.
///
/// Built entirely from static constants — GAME_PAGES and LEGAL_PAGES — so it
/// prerenders at build time with no database round trip. That is a deliberate
/// tradeoff over enumerating the Game table: a sitemap that queries Postgres
/// fails the build when the database is briefly unreachable, and the set of
/// *marketed* URLs changes far less often than the catalog behind them. See
/// the note on GAME_PAGES in src/lib/site.ts.
///
/// Only URLs that return 200 and are meant to be indexed belong here. Four
/// kinds of page are therefore missing on purpose:
///
///   - "/" — it 307s to /sargam (see src/app/page.tsx). Listing a redirect is
///     a sitemap error in Search Console, and the destination is already here.
///   - /login, /signup — noindex; nothing to rank for.
///   - /multiplayer/room/[code] — ephemeral, invite-only, noindex.
///   - /games/[slug] — the legacy config view, noindex, and it would compete
///     with /sargam for the same game.

/// LAST_UPDATED is human copy ("1 September 2026"), not an ISO date, because
/// it is rendered verbatim on the legal pages. Parse defensively and fall back
/// to omitting lastModified rather than emitting an Invalid Date: a missing
/// lastModified is ignored, a malformed one invalidates the entry.
function legalLastModified(): Date | undefined {
  const parsed = new Date(LAST_UPDATED);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const legalUpdated = legalLastModified();

  const gameEntries: MetadataRoute.Sitemap = GAME_PAGES.map((game) => ({
    url: absoluteUrl(game.path),
    // The board is redrawn from a fresh puzzle every day, so the page a
    // crawler last saw is genuinely stale within 24 hours.
    changeFrequency: "daily",
    // The landing page for the only game that ships today — nothing on the
    // site should outrank it.
    priority: 1,
  }));

  const dailyEntry: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/play/daily"),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const legalEntries: MetadataRoute.Sitemap = [
    // The index first, then the five documents in the same reading order the
    // footer uses.
    { url: absoluteUrl("/legal"), priority: 0.3 },
    ...LEGAL_PAGES.map((page) => ({
      url: absoluteUrl(page.href),
      priority: 0.2,
    })),
  ].map((entry) => ({
    ...entry,
    lastModified: legalUpdated,
    // These change when the law does, which is to say rarely — but "yearly"
    // would discourage a recrawl after a policy revision.
    changeFrequency: "monthly" as const,
  }));

  return [...gameEntries, ...dailyEntry, ...legalEntries];
}

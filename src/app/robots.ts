import type { MetadataRoute } from "next";
import { absoluteUrl, IS_PUBLIC_SITE, SITE_URL } from "@/lib/site";

/// Serves /robots.txt.
///
/// A route rather than a file in public/ so the Sitemap: line always carries
/// the origin this build actually deployed to — a hardcoded domain in a static
/// file is the classic way to end up advertising a sitemap on the wrong host.
///
/// What is *not* here matters as much as what is. Three groups of pages are
/// kept out of search by a `robots: { index: false }` meta tag on the page
/// instead of a Disallow line: the auth screens, the multiplayer rooms, and
/// the legacy /games/[slug] spec pages. Disallow and noindex don't stack —
/// a crawler told not to fetch a URL never sees the noindex on it, so a
/// disallowed page that someone links to externally can still surface as a
/// bare URL in results. Allowing the fetch is what lets the noindex land.
export default function robots(): MetadataRoute.Robots {
  // A build with no NEXT_PUBLIC_APP_URL fell through to localhost (see
  // IS_PUBLIC_SITE). That is either local dev — where nothing crawls this
  // anyway — or a misconfigured deployment, and the second case is the one
  // worth failing closed for.
  if (!IS_PUBLIC_SITE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // JSON endpoints. Nothing here renders, and run/room routes mutate
          // state, so there is no reason for a crawler to touch them.
          "/api/",
          // The internal console. Behind requireAdmin(), so a crawler would
          // only ever collect redirects — and it must never be indexed, which
          // makes this the one place Disallow is strictly better than noindex.
          "/admin",
          // Next's build output. Hashed asset URLs churn on every deploy and
          // the RSC payloads are duplicates of pages already being crawled.
          "/_next/",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    // Declares which hostname is the canonical one. Ignored by Google (which
    // reads rel=canonical instead) but still honoured by Yandex and a few
    // others, and harmless to state.
    host: SITE_URL,
  };
}

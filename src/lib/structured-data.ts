/// JSON-LD builders.
///
/// Meta tags tell a crawler how to *display* a page; this tells it what the
/// page is *about* — that Cluecade is one publisher, that Sargam is a free
/// browser game it publishes, and how the legal pages nest under it. That
/// entity graph is what lets Google show a brand knowledge panel and stop
/// treating /sargam and /legal/terms as two unrelated documents.
///
/// Everything here is plain data. No JSX, no client bundle — the objects are
/// serialised into a <script type="application/ld+json"> by the JsonLd
/// component in src/components/JsonLd.tsx.
///
/// Rule of thumb when adding to this file: never mark up a claim the page
/// doesn't back up. Google treats structured data that contradicts the visible
/// page as spam, and the penalty lands on the whole site, not the one page.
/// That is why there is no FAQPage or HowTo here despite the game having a
/// "How to play" list — that list lives in a modal that never reaches the
/// initial HTML, so marking it up would be describing content a crawler can't
/// see.

import { CONTACTS, OPERATOR } from "@/lib/legal";
import { absoluteUrl, GAME_PAGES, SITE, SITE_URL } from "@/lib/site";

/// Stable @id anchors. Fragments on the site's own origin, which is the
/// convention for "the node representing X" — they let the WebSite node point
/// at the Organization node instead of repeating it, and let a game page
/// reference both without redefining either.
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/// A loose type for a JSON-LD node. Deliberately not a full schema.org typing:
/// the vocabulary is enormous, the shape is validated by Google's Rich Results
/// Test rather than by tsc, and a hand-written interface here would be a
/// maintenance cost that catches nothing.
export type JsonLdNode = Record<string, unknown>;

/// Who publishes the site.
///
/// Cluecade is a sole proprietorship (see the note on OPERATOR in
/// src/lib/legal.ts), which is why this is an Organization with a `founder`
/// rather than a Person: the brand is the entity people search for, and the
/// proprietor's legal name is a property of it. The address and email are the
/// same ones the IT Rules require on /legal/contact — a crawler finding the
/// same details in both places is what makes the entity verifiable.
function organizationNode(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: OPERATOR.tradeName,
    legalName: OPERATOR.legalName,
    url: `${SITE_URL}/`,
    // schema.org accepts Text here, and a plain string can't drift out of sync
    // with the address rendered on the legal pages the way a hand-split
    // PostalAddress would.
    address: OPERATOR.address,
    email: CONTACTS.general,
    foundingLocation: OPERATOR.country,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icons/icon-512.png"),
      width: 512,
      height: 512,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACTS.general,
        areaServed: "IN",
        availableLanguage: ["en", "hi"],
      },
      {
        // Published under Rule 3(2) of the IT Rules 2021 and rendered on
        // /legal/contact. Naming it here too makes the grievance route
        // machine-discoverable, which is the point of the rule.
        "@type": "ContactPoint",
        contactType: "grievance redressal",
        email: CONTACTS.grievance,
        areaServed: "IN",
      },
    ],
  };
}

/// The site as a whole. Its only real job is to bind the domain to the
/// Organization above, so a crawler landing on any page knows who owns it.
///
/// No `potentialAction`/SearchAction: the site has no page that takes a search
/// query and renders results. The in-game autocomplete posts to an API and
/// stays on the board, and claiming a sitelinks search box that doesn't exist
/// is exactly the kind of contradiction that gets structured data ignored.
function webSiteNode(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    alternateName: `${SITE.name} — ${SITE.tagline}`,
    url: `${SITE_URL}/`,
    description: SITE.description,
    inLanguage: SITE.lang,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/// The site-wide graph, emitted once from the root layout.
///
/// A single @graph rather than two separate <script> tags: it lets the two
/// nodes cross-reference by @id, and it is what Google's parser expects when
/// several nodes describe one site.
export function siteGraph(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), webSiteNode()],
  };
}

type GamePage = (typeof GAME_PAGES)[number];

/// One playable game.
///
/// VideoGame (a subtype of both Game and SoftwareApplication) rather than
/// plain SoftwareApplication, because it carries the properties that actually
/// describe this thing — playMode, gamePlatform, genre.
///
/// The `offers` block is not decoration: "free" is a fact search engines
/// surface, and stating price 0 alongside isAccessibleForFree is how you say
/// it in a way they parse. Both are true — there is no paywall and no
/// purchase flow anywhere in the product. If that ever changes, this is one of
/// the first things that has to change with it.
export function videoGameNode(
  game: GamePage,
  /// Taken from the live Game row rather than hardcoded, so the markup can't
  /// claim a rule the engine no longer follows. `revealLadder` is the
  /// cumulative clip length in ms at each attempt.
  rules: { maxAttempts: number; revealLadder: readonly number[] },
): JsonLdNode {
  const url = absoluteUrl(game.path);

  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "@id": `${url}#game`,
    name: game.name,
    alternateName: game.headline,
    url,
    description: game.description,
    image: absoluteUrl(game.ogImage.url),
    inLanguage: SITE.lang,
    genre: [...game.genres],
    applicationCategory: "GameApplication",
    // Browser-only, so there is no OS requirement to state beyond "a browser".
    gamePlatform: "Web browser",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and HTML5 audio.",
    // Both are real surfaces: the solo board and the live rooms under
    // /multiplayer/room.
    playMode: ["SinglePlayer", "MultiPlayer"],
    numberOfPlayers: {
      "@type": "QuantitativeValue",
      minValue: 1,
    },
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      category: "free",
    },
    gameItem: {
      "@type": "Thing",
      name: "Mystery track",
      description: describeLadder(rules),
    },
  };
}

/// Turns the reveal ladder into a sentence.
///
/// Reads the first and last rungs off the ladder instead of quoting the
/// marketing copy: the headline says "15 seconds" but the ladder's own default
/// tops out at 7, and the two are free to diverge because an admin can retune
/// the column. Whatever this says has to be true of the game as configured
/// right now, so it comes from the data.
function describeLadder({
  maxAttempts,
  revealLadder,
}: {
  maxAttempts: number;
  revealLadder: readonly number[];
}): string {
  const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} seconds`;
  const first = revealLadder.at(0);
  const last = revealLadder.at(-1);

  // An empty ladder means the row is misconfigured (see toLadder in
  // src/lib/games.ts, which narrows defensively). Fall back to the one claim
  // that is still safe to make.
  if (first === undefined || last === undefined) {
    return `A mystery track revealed a fragment at a time across ${maxAttempts} attempts.`;
  }

  return `A mystery track revealed a fragment at a time: ${seconds(first)} on the first attempt, growing to ${seconds(last)} by attempt ${maxAttempts}.`;
}

/// The trail for a legal document: Cluecade › Legal › <document>.
///
/// A helper rather than a layout, because src/app/legal/layout.tsx can't know
/// which document is rendering — a server layout has no access to the current
/// pathname — and the trail's last crumb is exactly that. Each page passes its
/// own name; the index passes nothing and stops at "Legal".
export function legalBreadcrumbNode(documentName?: string): JsonLdNode {
  return breadcrumbNode([
    { name: SITE.name, path: "/" },
    // "Legal" only gets a URL when it is an intermediate crumb. On the index
    // itself it is the final one, and the final crumb carries no item.
    documentName ? { name: "Legal", path: "/legal" } : { name: "Legal" },
    ...(documentName ? [{ name: documentName }] : []),
  ]);
}

/// A breadcrumb trail, for the "Cluecade › Legal › Privacy Policy" line Google
/// shows in place of a raw URL.
///
/// `item` is omitted on the final crumb, per Google's guidance — the last
/// entry is the page you are already on, and giving it a URL invites the
/// self-referential link they warn about.
export function breadcrumbNode(
  trail: readonly { name: string; path?: string }[],
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      ...(crumb.path ? { item: absoluteUrl(crumb.path) } : {}),
    })),
  };
}

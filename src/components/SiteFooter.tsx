"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OPERATOR } from "@/lib/legal";

/// The site-wide footer, mounted once in the root layout.
///
/// One link, to the /legal index, rather than one per document. The index is
/// already built to be the hub — it lists all five with a blurb each — and five
/// links wrapping across a phone footer under every screen in the product cost
/// more than they bought.
///
/// Client-side only for the pathname check — it still renders to HTML on the
/// server, which matters: Google's OAuth verification (and anyone auditing the
/// site) looks for a reachable privacy policy link, and a link that only exists
/// after hydration is one some crawlers never see. The policy is now one hop
/// away via /legal rather than linked directly; if a verification form wants a
/// direct URL, give it /legal/privacy.
///
/// Hidden under /admin. That console is an internal tool behind a login, its
/// layout is deliberately min-h-screen (see the comment there), and appending a
/// public legal footer to it would buy nothing but a scrollbar on every page.
///
/// Kept deliberately short elsewhere. It sits under every player-facing screen
/// including the game, so height here is height the player scrolls past.
export function SiteFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  const year = new Date().getFullYear();

  return (
    // shrink-0 is load-bearing: <body> is a flex column whose height is driven
    // by min-height, so on any page taller than the viewport the default
    // flex-shrink squashes this footer to a fraction of its height and the
    // content above overlaps it.
    <footer className="shrink-0 border-t border-(--hairline) bg-(--bg) py-6 text-sm text-(--text-dim)">
      {/* Padding goes inside the max-width box, not on the <footer> — the game
          and daily shells are built the same way, and putting it outside
          instead shifts these links a padding-width left of the content they
          sit under. */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link
          href="/legal"
          className="transition-colors hover:text-(--text) hover:underline hover:underline-offset-4"
        >
          Terms, Privacy &amp; Legal
        </Link>

        <p className="text-(--text-faint)">
          © {year} {OPERATOR.tradeName}
        </p>
      </div>
    </footer>
  );
}

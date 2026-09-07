"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_PAGES, OPERATOR } from "@/lib/legal";

/// The site-wide footer, mounted once in the root layout.
///
/// Client-side only for the pathname check — it still renders to HTML on the
/// server, which matters: Google's OAuth verification (and anyone auditing the
/// site) looks for a reachable privacy policy link, and a link that only exists
/// after hydration is one some crawlers never see.
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
    <footer className="shrink-0 border-t border-(--hairline) bg-(--surface) py-6 text-sm text-(--text-dim)">
      {/* Padding goes inside the max-width box, not on the <footer> — the game
          and daily shells are built the same way, and putting it outside
          instead shifts these links a padding-width left of the content they
          sit under. */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <nav aria-label="Legal">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_PAGES.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className="transition-colors hover:text-(--text) hover:underline hover:underline-offset-4"
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-(--text-faint)">
          © {year} {OPERATOR.tradeName}
        </p>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_PAGES } from "@/lib/legal";

/// The only client component in /legal — it exists purely so the current
/// document is marked. Everything else in this section is static server-rendered
/// text, which is what we want: legal pages should render for a crawler, for a
/// regulator, and with JavaScript switched off.
export function LegalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Legal documents" className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {LEGAL_PAGES.map((page) => {
          const isCurrent = pathname === page.href;

          return (
            <li key={page.href}>
              <Link
                href={page.href}
                title={page.blurb}
                // aria-current is what actually conveys "you are here" — the
                // colour shift alone would leave screen readers with five
                // identical links.
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "block rounded-full border border-(--signal) bg-(--signal)/15 px-3.5 py-1.5 text-sm font-medium text-(--text)"
                    : "block rounded-full border border-(--hairline) px-3.5 py-1.5 text-sm text-(--text-dim) transition-colors hover:border-(--signal)/50 hover:text-(--text)"
                }
              >
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

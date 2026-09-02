import type { Metadata } from "next";
import Link from "next/link";
import { LAST_UPDATED, LEGAL_PAGES } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Cluecade's terms of service, privacy policy, cookie policy, copyright policy, and grievance contact details.",
  alternates: { canonical: "/legal" },
};

/// An index rather than a redirect to the Terms. "/legal" is the link people
/// paste when they mean "where are your policies" — landing them on one
/// specific document hides the other four.
export default function LegalIndexPage() {
  return (
    <article>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-(--text)">
        Legal
      </h1>
      <p className="mt-3 text-(--text-dim)">
        The documents that govern your use of Cluecade. All five were last
        updated on {LAST_UPDATED}.
      </p>

      <ul className="mt-8 flex flex-col gap-3">
        {LEGAL_PAGES.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              className="flex flex-col gap-1 rounded-2xl border border-(--hairline) bg-(--surface) p-5 transition-colors hover:border-(--signal)/50 hover:bg-(--surface-hover)"
            >
              <span className="font-medium text-(--text)">{page.label}</span>
              <span className="text-sm text-(--text-dim)">{page.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

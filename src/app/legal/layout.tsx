import Link from "next/link";
import { LAST_UPDATED } from "@/lib/legal";
import { LegalNav } from "./legal-nav";

/// Shell shared by every legal document: brand lockup, cross-links to the other
/// four documents, and the "last updated" stamp.
///
/// Deliberately not the auth layout's LiveBackground treatment. These pages are
/// read, printed, and occasionally pasted into an email by someone filing a
/// complaint — an animated backdrop behind body copy works against all three.
export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    // Column width and padding match the game and daily shells — padding inside
    // the max-width box, so the site footer below lines up with this content.
    <div className="page-backdrop min-h-full py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6">
        <header className="border-b border-(--hairline) pb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                className="h-9 w-9 rounded-xl bg-cover bg-center"
                style={{ backgroundImage: "url('/brand/cluecade-mark.png')" }}
                aria-hidden="true"
              />
              <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-(--text)">
                Cluecade
              </span>
            </Link>

            {/* The way out. These pages are a dead end otherwise — they are
                linked from the footer of every screen, so a reader arrives here
                mid-game and needs an obvious route back, not just a clickable
                wordmark. */}
            <Link
              href="/"
              className="rounded-full border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-dim) transition-colors hover:border-(--signal)/50 hover:bg-(--surface-hover) hover:text-(--text)"
            >
              <span aria-hidden="true">←</span> Back to game
            </Link>
          </div>

          <LegalNav />
        </header>

        <main className="pt-10">{children}</main>

        {/* Just the date — the "back to game" button in the header covers the
            way out, and the site footer below covers the cross-links. */}
        <div className="mt-16 border-t border-(--hairline) pt-6 text-sm text-(--text-faint)">
          Last updated {LAST_UPDATED}.
        </div>
      </div>
    </div>
  );
}

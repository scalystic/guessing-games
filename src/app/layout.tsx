import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Instrument_Sans } from "next/font/google";
import Script from "next/script";
import { CookieNotice } from "@/components/CookieNotice";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fraunces' warm, slightly retro serif reads like vinyl-sleeve type —
// fitting for the cassette-deck aesthetic without turning into a novelty font.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  // Resolves the relative canonical/openGraph URLs each page sets.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Cluecade",
    template: "%s · Cluecade",
  },
  description: "A growing arcade of quick guessing games.",
};

// Applies the saved light/dark choice before first paint — avoids both a
// flash of the wrong theme and a hydration mismatch, since React never
// renders a value that depends on this; it just finds the class already
// there. See src/lib/theme-mode.ts for the toggle that writes it.
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('cluecade-theme-mode');document.documentElement.classList.toggle('dark',m==='dark');}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-(--bg) text-(--text)">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <main className="flex-1">{children}</main>
        {/* Mounted at the root so the legal links exist on every screen —
            including /sargam, which is where "/" sends people and therefore the
            page an OAuth reviewer will actually look at. */}
        <SiteFooter />
        <CookieNotice />
      </body>
    </html>
  );
}

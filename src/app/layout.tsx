import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono, Instrument_Sans } from "next/font/google";
import Script from "next/script";
import { CookieNotice } from "@/components/CookieNotice";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE, SITE_URL } from "@/lib/site";
import { siteGraph } from "@/lib/structured-data";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  // Resolves the relative canonical/openGraph URLs each page sets. SITE_URL
  // adds a Vercel fallback behind NEXT_PUBLIC_APP_URL so a deploy that forgot
  // the env var still emits production canonicals rather than localhost ones
  // — see src/lib/site.ts.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE.name,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  // Google reads these as authorship signals for the brand; they cost nothing
  // and they are the same entity the JSON-LD Organization names.
  authors: [{ name: SITE.name, url: `${SITE_URL}/` }],
  creator: SITE.name,
  publisher: SITE.name,

  // The site-wide default. Every indexable page then narrows or overrides it:
  // /sargam spells out the googleBot preview limits, and the auth, admin,
  // multiplayer and legacy /games pages flip index to false.
  robots: {
    index: true,
    follow: true,
  },

  // Defaults for any page that doesn't build its own card. Pages that do
  // (/sargam) replace this wholesale rather than merging into it, which is why
  // the values here are the generic brand ones.
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: "/",
    locale: SITE.locale,
    images: [SITE.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [SITE.ogImage.url],
  },

  // Points at src/app/manifest.ts. Next only emits the <link rel="manifest">
  // when it is named here.
  manifest: "/manifest.webmanifest",

  // iOS reads these when the game is added to the home screen. Without them
  // Safari opens the installed shortcut in a browser chrome instead of
  // standalone, and shows the full "… · Cluecade" title under the icon.
  appleWebApp: {
    capable: true,
    title: SITE.name,
    statusBarStyle: "black-translucent",
  },

  // Safari on iOS turns anything that looks like a phone number into a tel:
  // link, styled in its own blue. The legal pages are full of dates, PIN codes
  // and rule numbers ("Rule 3(2)(a)(i)", "440014") that trip that heuristic.
  formatDetection: {
    telephone: false,
  },
};

/// Split out of `metadata` because Next requires it: viewport and themeColor
/// moved to their own export, and leaving them in metadata is a silent no-op
/// with a build warning.
export const viewport: Viewport = {
  // Paints the browser UI to match the page. Two entries, not one — a single
  // themeColor would leave the address bar dark on a light-theme page (and
  // Chrome on Android colours the status bar from it).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9e1d3" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1120" },
  ],
  // Deliberately not maximum-scale/user-scalable: pinch-zoom is a WCAG 1.4.4
  // requirement, and blocking it is a real accessibility failure that some
  // audits also read as a mobile-usability signal.
  width: "device-width",
  initialScale: 1,
};

// Applies the saved light/dark choice before first paint — avoids both a
// flash of the wrong theme and a hydration mismatch, since React never
// renders a value that depends on this; it just finds the class already
// there. See src/lib/theme-mode.ts for the toggle that writes it.
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('cluecade-theme-mode');document.documentElement.classList.toggle('dark',m==='dark');}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={SITE.lang}
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-(--bg) text-(--text)">
        {/* Mounted at the root so the Organization/WebSite nodes appear on
            every page. Pages that describe *themselves* (the VideoGame node on
            /sargam, the breadcrumb trails on /legal) add their own graph and
            reference these two by @id. */}
        <JsonLd data={siteGraph()} />
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

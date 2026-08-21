import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Bold geometric sans for branding/headings — swapped in for a cleaner,
// more modern feel than the earlier serif display face.
const poppins = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

export const metadata: Metadata = {
  // Resolves the relative canonical/openGraph URLs each page sets.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Guessing Games",
    template: "%s · Guessing Games",
  },
  description: "Daily guessing games. One clip, six attempts.",
};

// Applies the saved light/dark choice before first paint — avoids both a
// flash of the wrong theme and a hydration mismatch, since React never
// renders a value that depends on this; it just finds the class already
// there. See src/lib/theme-mode.ts for the toggle that writes it.
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('sargam-theme-mode');document.documentElement.classList.toggle('dark',m!=='light');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-(--bg) text-(--text)">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}

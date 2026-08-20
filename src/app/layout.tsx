import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import UserNav from "@/app/components/user-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

async function getUser() {
  const session = await getSession();
  if (!session) return null;

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { displayName: true, kind: true },
  });

  if (!player) return null;

  return { displayName: player.displayName, kind: player.kind };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-50 border-b border-black/[.06] bg-white/80 backdrop-blur-lg dark:border-white/[.08] dark:bg-black/80">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white">
                G
              </span>
              Guessing Games
            </Link>
            <UserNav user={user} />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}


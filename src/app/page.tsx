import type { Metadata } from "next";
import { listActiveGames } from "@/lib/games";
import HomeView from "./home-view";

// Game config changes rarely and only via seed/admin, so serve it prerendered
// and refresh at most hourly rather than hitting Postgres on every visit.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Guessing Games",
  description: "Daily guessing games. Pick a game and start your run.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "Guessing Games",
    description: "Daily guessing games. Pick a game and start your run.",
  },
};

export default async function Page() {
  const games = await listActiveGames();

  return <HomeView games={games} />;
}

import type { Metadata } from "next";
import { fetchGames } from "@/lib/api/games";
import HomeView from "./home-view";

// This page consumes /api/games over HTTP rather than querying Postgres
// directly, so it cannot be prerendered — at build time there is no server
// listening to answer the request. Caching moves down a layer instead: the
// route handler holds `revalidate = 3600`, so the DB is still only read hourly.
export const dynamic = "force-dynamic";

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
  const games = await fetchGames();

  return <HomeView games={games} />;
}

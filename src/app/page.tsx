import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveGameBySlug } from "@/lib/games";
import Home from "./home-client";

/// The one game v1 ships. A game picker would read /api/games instead.
const GAME_SLUG = "songless";

export default async function Page() {
  // Read straight from the data layer rather than fetching our own API: this is
  // a server component, and an HTTP round trip to ourselves buys nothing.
  const [user, game] = await Promise.all([
    getCurrentUser(),
    getActiveGameBySlug(GAME_SLUG),
  ]);

  // Only reachable if the seed hasn't been run — better a 404 than a board
  // rendered against an undefined reveal ladder.
  if (!game) notFound();

  return <Home user={user} game={game} />;
}

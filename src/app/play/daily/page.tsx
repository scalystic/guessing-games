import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveGameBySlug } from "@/lib/games";
import DailyClient from "./daily-client";

const GAME_SLUG = "songless";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const [user, game] = await Promise.all([
    getCurrentUser(),
    getActiveGameBySlug(GAME_SLUG),
  ]);

  if (!game) notFound();

  return <DailyClient user={user} game={game} />;
}

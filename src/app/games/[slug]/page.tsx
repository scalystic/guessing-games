import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveGameBySlug } from "@/lib/games";
import GameView from "./game-view";

// Game config changes rarely and only via seed/admin, so serve it prerendered
// and refresh at most hourly rather than hitting Postgres on every visit.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: PageProps<"/games/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const game = await getActiveGameBySlug(slug);

  if (!game) return { title: "Game not found" };

  const description =
    game.tagline ?? `${game.name} — ${game.maxAttempts} attempts per puzzle.`;
  const url = `/games/${game.slug}`;

  return {
    title: game.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: game.name,
      description,
    },
  };
}

export default async function Page({ params }: PageProps<"/games/[slug]">) {
  const { slug } = await params;
  const game = await getActiveGameBySlug(slug);

  if (!game) notFound();

  return <GameView game={game} />;
}

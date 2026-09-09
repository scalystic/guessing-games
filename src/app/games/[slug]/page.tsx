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

  if (!game) return { title: "Game not found", robots: { index: false } };

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
    // Kept out of search on purpose. This route renders the engine's config —
    // the reveal ladder, attempt and life counts — for the same Game row that
    // /sargam is the marketed landing page for. Two indexable URLs describing
    // one game is the textbook duplicate-content case, and the one that would
    // lose is the wrong one: this page shows operational copy ("Songless") and
    // a spec table, not the brand.
    //
    // follow: true because the "← All games" link out of here is legitimate.
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: PageProps<"/games/[slug]">) {
  const { slug } = await params;
  const game = await getActiveGameBySlug(slug);

  if (!game) notFound();

  return <GameView game={game} />;
}

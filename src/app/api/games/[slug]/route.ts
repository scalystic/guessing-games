import { getActiveGameBySlug, listActiveGames } from "@/lib/games";
import { internalErrorJson, jsonOk, notFoundJson } from "@/lib/api/response";

// Same policy as the pages that render this data: game config changes only via
// seed/admin, so cache the response and refresh at most hourly.
export const revalidate = 3600;

// Without this the segment stays fully dynamic and `revalidate` above is inert
// — Next has no params to prerender, so every request would reach Postgres.
export async function generateStaticParams() {
  const games = await listActiveGames();

  return games.map((game) => ({ slug: game.slug }));
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/games/[slug]">,
): Promise<Response> {
  const { slug } = await ctx.params;

  try {
    const game = await getActiveGameBySlug(slug);

    if (!game) return notFoundJson(`No active game with slug "${slug}".`);

    return jsonOk(game);
  } catch (error) {
    return internalErrorJson("games.detail", error);
  }
}

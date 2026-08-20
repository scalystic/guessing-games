import { getActiveGameBySlug } from "@/lib/games";
import { internalErrorJson, jsonOk, notFoundJson } from "@/lib/api/response";

// Same policy as the pages that render this data: game config changes only via
// seed/admin, so cache the response and refresh at most hourly.
export const revalidate = 3600;

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

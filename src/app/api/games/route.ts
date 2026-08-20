import { listActiveGames } from "@/lib/games";
import { internalErrorJson, jsonOk } from "@/lib/api/response";

// Same policy as the pages that render this data: game config changes only via
// seed/admin, so cache the response and refresh at most hourly.
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  try {
    const games = await listActiveGames();

    return jsonOk(games);
  } catch (error) {
    return internalErrorJson("games.list", error);
  }
}

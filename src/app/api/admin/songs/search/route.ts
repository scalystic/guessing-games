import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin/auth";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";
import { findRecentDailyUses } from "@/lib/game/daily-repeat";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));
  // The day this search is building a challenge for — defaults to today so a
  // plain search (no challenge context) still flags recent repeats sanely.
  const forDayKey = url.searchParams.get("dayKey") ?? new Date().toISOString().slice(0, 10);
  // Editing an existing challenge shouldn't flag the songs it already owns.
  const excludeChallengeId = url.searchParams.get("excludeChallengeId") ?? undefined;

  if (q.length < 2) return jsonOk([]);

  try {
    const game = await prisma.game.findUnique({
      where: { slug: "songless" },
      select: { id: true },
    });
    if (!game) return jsonError(404, "not_found", "Game not found.");

    const songs = await prisma.song.findMany({
      where: {
        puzzle: { gameId: game.id, isBlocked: false },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { artist: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      select: {
        puzzleId: true,
        title: true,
        artist: true,
        album: true,
        externalId: true,
      },
      orderBy: { title: "asc" },
    });

    const recentDayKeyByPuzzle = await findRecentDailyUses(
      songs.map((s) => s.puzzleId),
      forDayKey,
      excludeChallengeId,
    );

    const result = songs.map((song) => ({
      ...song,
      recentDailyUseDayKey: recentDayKeyByPuzzle.get(song.puzzleId) ?? null,
    }));

    return jsonOk(result);
  } catch (error) {
    return internalErrorJson("admin.songs.search", error);
  }
}

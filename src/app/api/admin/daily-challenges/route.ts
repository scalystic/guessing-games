import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin/auth";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";
import { z } from "zod";
import { randomUUID } from "crypto";
import { DAILY_REPEAT_COOLDOWN_DAYS, findRecentDailyUses } from "@/lib/game/daily-repeat";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  try {
    const challenges = await prisma.dailyChallenge.findMany({
      orderBy: { dayKey: "desc" },
      select: {
        id: true,
        title: true,
        dayKey: true,
        roundCount: true,
        rewardCoins: true,
        rewardXp: true,
        publishedAt: true,
        createdAt: true,
        _count: { select: { runs: true } },
        runs: { select: { status: true, score: true } },
        entries: {
          orderBy: { roundIndex: "asc" },
          select: {
            roundIndex: true,
            puzzleId: true,
            puzzle: {
              select: { song: { select: { title: true, artist: true } } },
            },
          },
        },
      },
    });

    const result = challenges.map((c) => {
      const completed = c.runs.filter((r) => r.status === "COMPLETED");
      const avgScore =
        completed.length > 0
          ? Math.round(
              completed.reduce((s, r) => s + r.score, 0) / completed.length,
            )
          : 0;
      return {
        id: c.id,
        title: c.title,
        dayKey: c.dayKey,
        roundCount: c.roundCount,
        rewardCoins: c.rewardCoins,
        rewardXp: c.rewardXp,
        publishedAt: c.publishedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        songs: c.entries.map((e) => ({
          roundIndex: e.roundIndex,
          puzzleId: e.puzzleId,
          title: e.puzzle.song?.title ?? "Unknown",
          artist: e.puzzle.song?.artist ?? "—",
        })),
        stats: { totalRuns: c._count.runs, completedRuns: completed.length, avgScore },
      };
    });

    return jsonOk({ challenges: result });
  } catch (error) {
    return internalErrorJson("daily-challenges.list", error);
  }
}

const SongEntry = z.object({
  puzzleId: z.string().min(1),
  roundIndex: z.number().int().min(1).max(30),
});

const CreateSchema = z.object({
  title: z.string().max(200).optional(),
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  songs: z.array(SongEntry).min(1).max(30),
  rewardCoins: z.number().int().min(0).max(10_000).default(0),
  rewardXp: z.number().int().min(0).max(10_000).default(0),
  publishNow: z.boolean().default(false),
});

export async function POST(request: Request): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.");
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "validation_error", "Invalid request body.", parsed.error.flatten().fieldErrors);
  }

  const { title, dayKey, songs, rewardCoins, rewardXp, publishNow } = parsed.data;

  try {
    const game = await prisma.game.findUnique({
      where: { slug: "songless" },
      select: { id: true },
    });
    if (!game) return jsonError(404, "not_found", "Game not found.");

    const existing = await prisma.dailyChallenge.findUnique({
      where: { gameId_dayKey: { gameId: game.id, dayKey } },
    });
    if (existing) return jsonError(409, "conflict", `A challenge for ${dayKey} already exists.`);

    const puzzleIds = [...new Set(songs.map((s) => s.puzzleId))];
    const found = await prisma.puzzle.findMany({
      where: { id: { in: puzzleIds }, gameId: game.id },
      select: { id: true },
    });
    if (found.length < puzzleIds.length) {
      return jsonError(422, "validation_error", "One or more puzzleIds are invalid.");
    }

    // Mirrors the search endpoint's disabled-in-picker state: the picker can
    // only stop a click, not a request built by hand, so the rule is
    // re-checked here before anything is written.
    const recentUses = await findRecentDailyUses(puzzleIds, dayKey);
    if (recentUses.size > 0) {
      return jsonError(
        422,
        "songs_recently_used",
        `${recentUses.size} song(s) were already used in the daily rotation within the last ${DAILY_REPEAT_COOLDOWN_DAYS} days.`,
        Object.fromEntries(
          [...recentUses].map(([puzzleId, usedDayKey]) => [puzzleId, [`Used on ${usedDayKey}`]]),
        ),
      );
    }

    const challenge = await prisma.dailyChallenge.create({
      data: {
        gameId: game.id,
        title: title ?? null,
        dayKey,
        seed: randomUUID(),
        roundCount: songs.length,
        rewardCoins,
        rewardXp,
        publishedAt: publishNow ? new Date() : null,
        entries: {
          create: songs.map((s) => ({
            roundIndex: s.roundIndex,
            puzzleId: s.puzzleId,
          })),
        },
      },
    });

    return jsonOk({ id: challenge.id }, { status: 201 });
  } catch (error) {
    return internalErrorJson("daily-challenges.create", error);
  }
}

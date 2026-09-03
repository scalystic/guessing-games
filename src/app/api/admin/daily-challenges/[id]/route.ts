import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin/auth";
import { jsonError, jsonOk, notFoundJson, internalErrorJson } from "@/lib/api/response";
import { z } from "zod";
import { DAILY_REPEAT_COOLDOWN_DAYS, findRecentDailyUses } from "@/lib/game/daily-repeat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, ctx: Ctx): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");
  const { id } = await ctx.params;

  try {
    const c = await prisma.dailyChallenge.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        dayKey: true,
        roundCount: true,
        rewardCoins: true,
        rewardXp: true,
        publishedAt: true,
        createdAt: true,
        entries: {
          orderBy: { roundIndex: "asc" },
          select: {
            roundIndex: true,
            puzzleId: true,
            puzzle: {
              select: { song: { select: { title: true, artist: true, album: true } } },
            },
          },
        },
        _count: { select: { runs: true } },
        runs: { select: { status: true, score: true } },
      },
    });
    if (!c) return notFoundJson("Challenge not found.");

    const completed = c.runs.filter((r) => r.status === "COMPLETED");
    const avgScore =
      completed.length > 0
        ? Math.round(completed.reduce((s, r) => s + r.score, 0) / completed.length)
        : 0;

    return jsonOk({
      challenge: {
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
          album: e.puzzle.song?.album ?? null,
        })),
        stats: { totalRuns: c._count.runs, completedRuns: completed.length, avgScore },
      },
    });
  } catch (error) {
    return internalErrorJson("daily-challenges.get", error);
  }
}

const UpdateSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  songs: z
    .array(z.object({ puzzleId: z.string().min(1), roundIndex: z.number().int().min(1).max(30) }))
    .min(1)
    .max(30)
    .optional(),
  rewardCoins: z.number().int().min(0).max(10_000).optional(),
  rewardXp: z.number().int().min(0).max(10_000).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.");
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "validation_error", "Invalid request body.", parsed.error.flatten().fieldErrors);
  }

  const { title, songs, rewardCoins, rewardXp, publishedAt } = parsed.data;

  try {
    const existing = await prisma.dailyChallenge.findUnique({
      where: { id },
      select: { id: true, gameId: true, dayKey: true },
    });
    if (!existing) return notFoundJson("Challenge not found.");

    if (songs) {
      const runCount = await prisma.run.count({ where: { dailyChallengeId: id } });
      if (runCount > 0) {
        return jsonError(
          409,
          "conflict",
          "Cannot change songs after players have started this challenge.",
        );
      }

      // Mirrors the search endpoint's disabled-in-picker state: the picker
      // can only stop a click, not a request built by hand, so the rule is
      // re-checked here before anything is written.
      const recentUses = await findRecentDailyUses(
        songs.map((s) => s.puzzleId),
        existing.dayKey,
        id,
      );
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
    }

    await prisma.$transaction(async (tx) => {
      if (songs) {
        await tx.dailyChallengePuzzle.deleteMany({ where: { dailyChallengeId: id } });
        await tx.dailyChallengePuzzle.createMany({
          data: songs.map((s) => ({
            dailyChallengeId: id,
            roundIndex: s.roundIndex,
            puzzleId: s.puzzleId,
          })),
        });
      }
      await tx.dailyChallenge.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(rewardCoins !== undefined && { rewardCoins }),
          ...(rewardXp !== undefined && { rewardXp }),
          ...(publishedAt !== undefined && {
            publishedAt: publishedAt ? new Date(publishedAt) : null,
          }),
          ...(songs && { roundCount: songs.length }),
        },
      });
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return internalErrorJson("daily-challenges.update", error);
  }
}

export async function DELETE(_: Request, ctx: Ctx): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");
  const { id } = await ctx.params;

  try {
    const runCount = await prisma.run.count({ where: { dailyChallengeId: id } });
    if (runCount > 0) {
      return jsonError(
        409,
        "conflict",
        `Cannot delete — ${runCount} player(s) have already played this challenge.`,
      );
    }
    await prisma.dailyChallenge.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (error) {
    return internalErrorJson("daily-challenges.delete", error);
  }
}

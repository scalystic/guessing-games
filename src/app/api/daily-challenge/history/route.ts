import { prisma } from "@/lib/db";
import { ensurePlayer } from "@/lib/guest";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

export const dynamic = "force-dynamic";

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? null;
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

/// Every dayKey in the given "YYYY-MM" month, in order.
function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this one
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/// GET /api/daily-challenge/history?gameSlug=<slug>&days=<n>
/// GET /api/daily-challenge/history?gameSlug=<slug>&month=<YYYY-MM>
///
/// `days` (default 7) returns that many calendar days ending today — the week
/// strip. `month`, when present, returns every day of that calendar month
/// instead — the full-calendar view — and takes precedence over `days`.
/// Either way each day is marked whether this player actually played (made at
/// least one guess) that day's DAILY run — same "played" definition as the
/// alreadyPlayed flag in the /today route, so the two never disagree.
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const gameSlug = url.searchParams.get("gameSlug") ?? "songless";
    const monthParam = url.searchParams.get("month");

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: { id: true },
    });
    if (!game) return jsonError(404, "not_found", `No active game "${gameSlug}".`);

    const todayKey = new Date().toISOString().slice(0, 10);

    let dayKeys: string[];
    if (monthParam) {
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return jsonError(400, "invalid_month", "month must be YYYY-MM.");
      }
      dayKeys = daysInMonth(monthParam);
    } else {
      const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days") ?? "7")));
      dayKeys = Array.from({ length: days }, (_, i) => shiftDayKey(todayKey, -(days - 1 - i)));
    }

    const { playerId } = await ensurePlayer(clientIp(request));

    const [runs, challenges] = await Promise.all([
      prisma.run.findMany({
        where: { playerId, gameId: game.id, mode: "DAILY", dayKey: { in: dayKeys } },
        select: { dayKey: true, rounds: { select: { attemptsUsed: true } } },
      }),
      prisma.dailyChallenge.findMany({
        where: { gameId: game.id, dayKey: { in: dayKeys }, publishedAt: { not: null } },
        select: { dayKey: true },
      }),
    ]);

    const playedDayKeys = new Set(
      runs.filter((r) => r.rounds.some((round) => round.attemptsUsed > 0)).map((r) => r.dayKey!),
    );
    const challengeDayKeys = new Set(challenges.map((c) => c.dayKey));

    return jsonOk({
      days: dayKeys.map((dayKey) => ({
        dayKey,
        dayNumber: Number(dayKey.slice(-2)),
        isToday: dayKey === todayKey,
        isFuture: dayKey > todayKey,
        hasChallenge: challengeDayKeys.has(dayKey),
        played: playedDayKeys.has(dayKey),
      })),
    });
  } catch (error) {
    return internalErrorJson("daily-challenge.history", error);
  }
}

import "server-only";
import { prisma } from "@/lib/db";

/// A song shouldn't repeat in the daily rotation within this many days of the
/// day it's being scheduled for, in either direction.
export const DAILY_REPEAT_COOLDOWN_DAYS = 30;

/// dayKey strings ("2026-08-19") round-trip correctly through a plain Date —
/// no timezone conversion needed since it names a calendar day, not an instant.
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

function dayKeyToUtcMs(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/// Maps each of `puzzleIds` that appears in some OTHER DailyChallenge within
/// DAILY_REPEAT_COOLDOWN_DAYS of `forDayKey` to the nearest such dayKey.
/// `excludeChallengeId` lets editing a challenge ignore its own entries.
export async function findRecentDailyUses(
  puzzleIds: string[],
  forDayKey: string,
  excludeChallengeId?: string,
): Promise<Map<string, string>> {
  if (puzzleIds.length === 0) return new Map();

  const windowStart = shiftDayKey(forDayKey, -DAILY_REPEAT_COOLDOWN_DAYS);
  const windowEnd = shiftDayKey(forDayKey, DAILY_REPEAT_COOLDOWN_DAYS);

  const uses = await prisma.dailyChallengePuzzle.findMany({
    where: {
      puzzleId: { in: puzzleIds },
      dailyChallenge: {
        dayKey: { gte: windowStart, lte: windowEnd },
        ...(excludeChallengeId ? { id: { not: excludeChallengeId } } : {}),
      },
    },
    select: { puzzleId: true, dailyChallenge: { select: { dayKey: true } } },
  });

  const forDayKeyMs = dayKeyToUtcMs(forDayKey);
  const byPuzzle = new Map<string, string>();
  for (const use of uses) {
    const current = byPuzzle.get(use.puzzleId);
    if (
      !current ||
      Math.abs(dayKeyToUtcMs(use.dailyChallenge.dayKey) - forDayKeyMs) <
        Math.abs(dayKeyToUtcMs(current) - forDayKeyMs)
    ) {
      byPuzzle.set(use.puzzleId, use.dailyChallenge.dayKey);
    }
  }
  return byPuzzle;
}

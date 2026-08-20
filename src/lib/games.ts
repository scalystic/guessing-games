import { cache } from "react";
import { prisma } from "@/lib/db";

/// Explicit view models. Routes and pages hand these out instead of Prisma
/// rows, so tuning knobs (popularity ramp, scoringVersion, config) never leak
/// into a JSON response or a client bundle.
export type GameSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  maxAttempts: number;
  dailyRounds: number;
};

export type GameDetail = GameSummary & {
  livesPerRun: number;
  revealLadder: number[];
};

const summarySelect = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  maxAttempts: true,
  dailyRounds: true,
} as const;

const detailSelect = {
  ...summarySelect,
  livesPerRun: true,
  revealLadder: true,
} as const;

/// Game.revealLadder is Json — the length/shape contract is enforced at ingest,
/// so narrow defensively here rather than trusting the column.
function toLadder(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((ms): ms is number => typeof ms === "number");
}

/// Every active game, alphabetical. React.cache collapses repeat calls within a
/// single request (page + metadata + route handler) into one query.
export const listActiveGames = cache(async (): Promise<GameSummary[]> => {
  return prisma.game.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: summarySelect,
  });
});

/// Returns null for both "no such slug" and "not active" — callers should not
/// be able to tell an unreleased game from a nonexistent one.
export const getActiveGameBySlug = cache(
  async (slug: string): Promise<GameDetail | null> => {
    const game = await prisma.game.findFirst({
      where: { slug, isActive: true },
      select: detailSelect,
    });

    if (!game) return null;

    return { ...game, revealLadder: toLadder(game.revealLadder) };
  },
);

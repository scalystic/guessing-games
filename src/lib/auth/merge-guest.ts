import "server-only";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// ---------------------------------------------------------------------------
// Guest → existing account merge
// ---------------------------------------------------------------------------
//
// Signup promotes the guest row in place (kind GUEST → USER), so progress is
// carried by definition. Signing IN is the harder case: the account row already
// exists, so the guest's rows have to be folded across to it and the guest row
// left behind as a tombstone.
//
// Why a tombstone rather than a delete: GuestClaim.guestPlayerId cascades on
// player delete, and that unique column is the only thing stopping a replayed
// guest cookie from being claimed twice. Deleting the guest would delete its own
// receipt.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type MergeResult = {
  merged: boolean;
  xpMerged: number;
  coinsMerged: number;
  runsMerged: number;
  /// Daily runs left on the guest: the account already has a run for that day
  /// and @@unique([playerId, gameId, dayKey]) admits only one.
  runsSkipped: number;
};

const NOTHING: MergeResult = {
  merged: false,
  xpMerged: 0,
  coinsMerged: 0,
  runsMerged: 0,
  runsSkipped: 0,
};

/**
 * Fold a guest player's progress into an existing account, once.
 *
 * Safe to call with any pair of ids — a guest that is already claimed, is not
 * actually a guest, or IS the target account returns `merged: false` instead of
 * throwing.
 */
export async function mergeGuestIntoPlayer(
  guestPlayerId: string,
  userPlayerId: string,
  reason: string,
): Promise<MergeResult> {
  if (guestPlayerId === userPlayerId) return NOTHING;

  return prisma.$transaction(
    async (tx) => {
      const guest = await tx.player.findUnique({
        where: { id: guestPlayerId },
        select: {
          id: true,
          kind: true,
          xp: true,
          coins: true,
          level: true,
          claimedAsGuest: { select: { id: true } },
        },
      });

      // Not a guest, already spent, or gone: nothing to carry over.
      if (!guest || guest.kind !== "GUEST" || guest.claimedAsGuest) return NOTHING;

      const user = await tx.player.findUnique({
        where: { id: userPlayerId },
        select: { id: true, level: true },
      });
      if (!user) return NOTHING;

      const skippedRunIds = await findConflictingDailyRunIds(
        tx,
        guestPlayerId,
        userPlayerId,
      );

      // XP/coins on Player are caches of the ledger, so whatever stays behind
      // with a skipped run has to stay out of the transferred totals too.
      const retained = skippedRunIds.length
        ? await tx.ledgerEntry.aggregate({
            where: { playerId: guestPlayerId, runId: { in: skippedRunIds } },
            _sum: { xpDelta: true, coinDelta: true },
          })
        : null;

      const retainedXp = retained?._sum.xpDelta ?? 0;
      const retainedCoins = retained?._sum.coinDelta ?? 0;
      const xpMerged = Math.max(0, guest.xp - retainedXp);
      const coinsMerged = Math.max(0, guest.coins - retainedCoins);

      // ---- Runs ------------------------------------------------------------
      // Practice/endless runs carry a NULL dayKey, which Postgres treats as
      // distinct, so those never collide.
      const { count: runsMerged } = await tx.run.updateMany({
        where: { playerId: guestPlayerId, id: { notIn: skippedRunIds } },
        data: { playerId: userPlayerId },
      });

      // ---- Ledger ----------------------------------------------------------
      // `notIn` on a nullable column drops NULL rows, so spell out the NULL arm.
      await tx.ledgerEntry.updateMany({
        where: {
          playerId: guestPlayerId,
          OR: [{ runId: null }, { runId: { notIn: skippedRunIds } }],
        },
        data: { playerId: userPlayerId },
      });

      await mergeGameStats(tx, guestPlayerId, userPlayerId);
      await mergePuzzleHistory(tx, guestPlayerId, userPlayerId);
      await mergeLeaderboardEntries(tx, guestPlayerId, userPlayerId);

      // ---- Balances --------------------------------------------------------
      await tx.player.update({
        where: { id: userPlayerId },
        data: {
          xp: { increment: xpMerged },
          coins: { increment: coinsMerged },
          // No level formula lives in code yet; take the better of the two
          // rather than inventing one here.
          level: Math.max(user.level, guest.level),
          lastSeenAt: new Date(),
        },
      });

      // Leave the tombstone holding only what stayed behind.
      await tx.player.update({
        where: { id: guestPlayerId },
        data: { xp: retainedXp, coins: retainedCoins },
      });

      // ---- Receipts --------------------------------------------------------
      await tx.guestClaim.create({
        data: {
          guestPlayerId,
          userPlayerId,
          xpMerged,
          coinsMerged,
          runsMerged,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          playerId: userPlayerId,
          kind: "GUEST_MERGE",
          xpDelta: 0,
          coinDelta: 0,
          reason,
          meta: {
            guestPlayerId,
            runsMerged,
            runsSkipped: skippedRunIds.length,
            skippedRunIds,
          },
        },
      });

      return {
        merged: true,
        xpMerged,
        coinsMerged,
        runsMerged,
        runsSkipped: skippedRunIds.length,
      };
    },
    { timeout: 15_000 },
  );
}

/**
 * Merge the guest attached to the current session into `userPlayerId`.
 *
 * Call this immediately before `createSession` on every sign-in path. Merge
 * failures are logged and swallowed: losing guest progress is bad, but failing
 * the sign-in over it is worse.
 */
export async function claimGuestProgress(
  userPlayerId: string,
  reason: string,
): Promise<MergeResult> {
  try {
    const session = await getSession();
    if (session?.kind !== "GUEST") return NOTHING;

    return await mergeGuestIntoPlayer(session.playerId, userPlayerId, reason);
  } catch (error) {
    console.error("[auth:merge-guest]", error);
    return NOTHING;
  }
}

// ---------------------------------------------------------------------------
// Per-relation merges
// ---------------------------------------------------------------------------

/// Daily runs the account already has a same-day row for. Those can't move.
async function findConflictingDailyRunIds(
  tx: Tx,
  guestPlayerId: string,
  userPlayerId: string,
): Promise<string[]> {
  const guestDailies = await tx.run.findMany({
    where: { playerId: guestPlayerId, dayKey: { not: null } },
    select: { id: true, gameId: true, dayKey: true },
  });
  if (guestDailies.length === 0) return [];

  const userDailies = await tx.run.findMany({
    where: {
      playerId: userPlayerId,
      dayKey: { in: guestDailies.map((r) => r.dayKey!) },
    },
    select: { gameId: true, dayKey: true },
  });

  const taken = new Set(userDailies.map((r) => `${r.gameId}:${r.dayKey}`));
  return guestDailies
    .filter((r) => taken.has(`${r.gameId}:${r.dayKey}`))
    .map((r) => r.id);
}

/// PlayerGameStat is a rollup with a unique on (playerId, gameId), so colliding
/// rows are combined field by field rather than reassigned. Counters that a
/// skipped daily contributed to stay in the total — the rollup is a cache, and
/// unpicking one run from a sum isn't possible without replaying the runs.
async function mergeGameStats(
  tx: Tx,
  guestPlayerId: string,
  userPlayerId: string,
): Promise<void> {
  const guestStats = await tx.playerGameStat.findMany({
    where: { playerId: guestPlayerId },
  });
  if (guestStats.length === 0) return;

  const userStats = await tx.playerGameStat.findMany({
    where: {
      playerId: userPlayerId,
      gameId: { in: guestStats.map((s) => s.gameId) },
    },
  });
  const byGame = new Map(userStats.map((s) => [s.gameId, s]));

  for (const guestStat of guestStats) {
    const userStat = byGame.get(guestStat.gameId);

    if (!userStat) {
      await tx.playerGameStat.update({
        where: { id: guestStat.id },
        data: { playerId: userPlayerId },
      });
      continue;
    }

    await tx.playerGameStat.update({
      where: { id: userStat.id },
      data: {
        runsPlayed: userStat.runsPlayed + guestStat.runsPlayed,
        roundsPlayed: userStat.roundsPlayed + guestStat.roundsPlayed,
        roundsSolved: userStat.roundsSolved + guestStat.roundsSolved,
        xp: userStat.xp + guestStat.xp,
        bestRunScore: Math.max(userStat.bestRunScore, guestStat.bestRunScore),
        bestDailyScore: Math.max(userStat.bestDailyScore, guestStat.bestDailyScore),
        bestRoundStreak: Math.max(
          userStat.bestRoundStreak,
          guestStat.bestRoundStreak,
        ),
        currentDailyStreak: Math.max(
          userStat.currentDailyStreak,
          guestStat.currentDailyStreak,
        ),
        longestDailyStreak: Math.max(
          userStat.longestDailyStreak,
          guestStat.longestDailyStreak,
        ),
        streakFreezesLeft: Math.max(
          userStat.streakFreezesLeft,
          guestStat.streakFreezesLeft,
        ),
        // dayKeys are "YYYY-MM-DD", so lexicographic max is chronological max.
        lastPlayedDayKey: laterDayKey(
          userStat.lastPlayedDayKey,
          guestStat.lastPlayedDayKey,
        ),
      },
    });

    await tx.playerGameStat.delete({ where: { id: guestStat.id } });
  }
}

function laterDayKey(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/// Keyed on (playerId, puzzleId). Collisions add their seen counts so the
/// repeat cooldown still sees everything the player has actually played.
async function mergePuzzleHistory(
  tx: Tx,
  guestPlayerId: string,
  userPlayerId: string,
): Promise<void> {
  const guestRows = await tx.playerPuzzleHistory.findMany({
    where: { playerId: guestPlayerId },
  });
  if (guestRows.length === 0) return;

  const userRows = await tx.playerPuzzleHistory.findMany({
    where: {
      playerId: userPlayerId,
      puzzleId: { in: guestRows.map((r) => r.puzzleId) },
    },
  });
  const byPuzzle = new Map(userRows.map((r) => [r.puzzleId, r]));

  for (const guestRow of guestRows) {
    const userRow = byPuzzle.get(guestRow.puzzleId);

    if (!userRow) {
      await tx.playerPuzzleHistory.update({
        where: {
          playerId_puzzleId: {
            playerId: guestPlayerId,
            puzzleId: guestRow.puzzleId,
          },
        },
        data: { playerId: userPlayerId },
      });
      continue;
    }

    const guestIsNewer = guestRow.lastSeenAt > userRow.lastSeenAt;

    await tx.playerPuzzleHistory.update({
      where: {
        playerId_puzzleId: {
          playerId: userPlayerId,
          puzzleId: guestRow.puzzleId,
        },
      },
      data: {
        seenCount: userRow.seenCount + guestRow.seenCount,
        lastSeenAt: guestIsNewer ? guestRow.lastSeenAt : userRow.lastSeenAt,
        lastOutcome: guestIsNewer ? guestRow.lastOutcome : userRow.lastOutcome,
      },
    });

    await tx.playerPuzzleHistory.delete({
      where: {
        playerId_puzzleId: {
          playerId: guestPlayerId,
          puzzleId: guestRow.puzzleId,
        },
      },
    });
  }
}

/// A player holds one row per board per period, so a collision keeps the better
/// placement: higher score, then lower reveal-ms tie-break.
async function mergeLeaderboardEntries(
  tx: Tx,
  guestPlayerId: string,
  userPlayerId: string,
): Promise<void> {
  const guestEntries = await tx.leaderboardEntry.findMany({
    where: { playerId: guestPlayerId },
  });
  if (guestEntries.length === 0) return;

  for (const guestEntry of guestEntries) {
    const key = {
      gameId: guestEntry.gameId,
      boardType: guestEntry.boardType,
      periodKey: guestEntry.periodKey,
    };

    const userEntry = await tx.leaderboardEntry.findUnique({
      where: { gameId_boardType_periodKey_playerId: { ...key, playerId: userPlayerId } },
    });

    if (!userEntry) {
      await tx.leaderboardEntry.update({
        where: { id: guestEntry.id },
        data: { playerId: userPlayerId },
      });
      continue;
    }

    if (beatsEntry(guestEntry, userEntry)) {
      await tx.leaderboardEntry.update({
        where: { id: userEntry.id },
        data: {
          score: guestEntry.score,
          tieBreakRevealMs: guestEntry.tieBreakRevealMs,
          tieBreakDurationMs: guestEntry.tieBreakDurationMs,
          runId: guestEntry.runId,
        },
      });
    }

    await tx.leaderboardEntry.delete({ where: { id: guestEntry.id } });
  }
}

type BoardScore = {
  score: number;
  tieBreakRevealMs: number | null;
  tieBreakDurationMs: number | null;
};

function beatsEntry(candidate: BoardScore, incumbent: BoardScore): boolean {
  if (candidate.score !== incumbent.score) {
    return candidate.score > incumbent.score;
  }
  // Lower is better on both tie-breaks; a null is "unknown", never an upgrade.
  return lowerWins(candidate.tieBreakRevealMs, incumbent.tieBreakRevealMs)
    ?? lowerWins(candidate.tieBreakDurationMs, incumbent.tieBreakDurationMs)
    ?? false;
}

function lowerWins(candidate: number | null, incumbent: number | null): boolean | null {
  if (candidate === null || incumbent === null || candidate === incumbent) return null;
  return candidate < incumbent;
}

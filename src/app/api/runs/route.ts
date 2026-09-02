import { z } from "zod";
import { prisma } from "@/lib/db";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { ensurePlayer } from "@/lib/guest";
import { mintRunToken } from "@/lib/game/run-token";
import { samplePuzzle } from "@/lib/game/selection";
// YOUTUBE-ONLY: `inlineAudioFor` is retired along with the stored-clip path.
import { randomBytes, randomUUID } from "crypto";

/// POST /api/runs — start a run.
///
/// v1 serves PRACTICE. DAILY needs a published DailyChallenge to draw its frozen
/// puzzle set from, so it is rejected here rather than silently behaving like
/// practice: a daily that sampled per-player would break the one property that
/// makes the board comparable.

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  gameSlug: z.string().min(1),
  mode: z.enum(["DAILY", "PRACTICE", "ENDLESS"]).default("PRACTICE"),
  /// Era category to sample from. Omitted/null = every era.
  decadeFilter: z.enum(["NINETIES", "TWO_THOUSANDS"]).nullish(),
});

const RUN_TTL_MINUTES = Number.parseInt(process.env.RUN_TTL_MINUTES ?? "180", 10);

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "invalid_body", "Expected { gameSlug, mode? }.");
    }
    const { gameSlug, mode, decadeFilter } = parsed.data;

    if (mode === "ENDLESS") {
      return jsonError(501, "mode_unavailable", `ENDLESS is not wired up yet.`);
    }

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: {
        id: true,
        maxAttempts: true,
        livesPerRun: true,
        scoringVersion: true,
        puzzleCooldownDays: true,
        startPopularity: true,
        rampPerRound: true,
        minPopularity: true,
        sampleWindow: true,
        ladderRevision: true,
      },
    });
    if (!game) return jsonError(404, "not_found", `No active game "${gameSlug}".`);

    const { playerId } = await ensurePlayer(clientIp(request));

    // DAILY mode: find today's published challenge and its first puzzle.
    if (mode === "DAILY") {
      const todayKey = new Date().toISOString().slice(0, 10);

      const challenge = await prisma.dailyChallenge.findFirst({
        where: { gameId: game.id, dayKey: todayKey, publishedAt: { not: null } },
        select: {
          id: true,
          dayKey: true,
          roundCount: true,
          entries: {
            where: { roundIndex: 1 },
            select: {
              puzzleId: true,
              targetPopularity: true,
              puzzle: {
                select: {
                  song: { select: { externalId: true, hookStartMs: true } },
                  // YOUTUBE-ONLY: the first round's AUDIO_CLIP asset used to be
                  // selected here so stage 1 could ride along with the start
                  // response:
                  //
                  // assets: {
                  //   where: { kind: "AUDIO_CLIP" as const },
                  //   select: { storageKey: true, stageByteOffsets: true, byteSize: true, ladderRevision: true },
                  //   take: 1,
                  // },
                },
              },
            },
            take: 1,
          },
        },
      });
      if (!challenge) {
        return jsonError(404, "no_challenge_today", "No daily challenge is published for today.");
      }

      const firstEntry = challenge.entries[0];
      if (!firstEntry) {
        return jsonError(500, "challenge_misconfigured", "Today's challenge has no puzzles.");
      }

      // One run per player per day. If an existing run has no guesses yet
      // (player opened the page but left without interacting), delete it so
      // they can start fresh. Only block re-entry once real guesses exist.
      const existing = await prisma.run.findFirst({
        where: { playerId, gameId: game.id, dailyChallengeId: challenge.id },
        select: {
          id: true,
          tokenHash: true,
          livesRemaining: true,
          currentRoundIndex: true,
          rounds: { select: { attemptsUsed: true } },
        },
      });
      if (existing) {
        const hasGuesses = existing.rounds.some((r) => r.attemptsUsed > 0);
        if (hasGuesses) {
          return jsonError(409, "already_started", "You already have a run for today's challenge.");
        }
        await prisma.run.delete({ where: { id: existing.id } });
      }

      const { token, tokenHash } = mintRunToken();
      const runId = randomUUID();

      const rows = await prisma.$queryRaw<{ lives_remaining: number; current_round_index: number }[]>`
        WITH r AS (
          INSERT INTO "Run" (
            id, "gameId", "playerId", mode, "dayKey", seed, "decadeFilter",
            "dailyChallengeId", "livesRemaining", "maxRounds", "scoringVersion",
            "isRanked", "tokenHash", "expiresAt"
          )
          VALUES (
            ${runId}, ${game.id}, ${playerId}, 'DAILY'::"RunMode",
            ${challenge.dayKey}, ${randomBytes(16).toString("hex")}, NULL,
            ${challenge.id}, ${game.livesPerRun}, ${challenge.roundCount},
            ${game.scoringVersion}, true,
            ${tokenHash}, ${new Date(Date.now() + RUN_TTL_MINUTES * 60 * 1000)}
          )
          RETURNING id, "livesRemaining", "currentRoundIndex"
        ),
        rr AS (
          INSERT INTO "RunRound" (
            id, "runId", "roundIndex", "puzzleId",
            "targetPopularity", "puzzlePopularity"
          )
          SELECT ${randomUUID()}, r.id, 1, ${firstEntry.puzzleId},
                 ${firstEntry.targetPopularity ?? 0}, 0
          FROM r
          RETURNING id
        )
        SELECT
          r."livesRemaining"    AS lives_remaining,
          r."currentRoundIndex" AS current_round_index
        FROM r, rr
      `;

      const created = rows[0];
      if (!created) {
        return internalErrorJson("runs.start.daily", new Error("run insert returned no row"));
      }

      const firstPuzzle = firstEntry.puzzle;
      const youtubeVideoId = firstPuzzle.song?.externalId ?? null;
      const hookStartMs = firstPuzzle.song?.hookStartMs ?? 0;
      // YOUTUBE-ONLY: was
      //   const firstAsset = firstPuzzle.assets[0] ?? null;
      //   const nextAudio = firstAsset ? await inlineAudioFor(firstAsset, 1, game.ladderRevision) : null;
      const nextAudio = null;

      return jsonOk({
        runId,
        runToken: token,
        mode,
        decadeFilter: null,
        roundIndex: created.current_round_index,
        stageReached: 1,
        attemptsRemaining: game.maxAttempts,
        livesRemaining: created.lives_remaining,
        // YOUTUBE-ONLY: was `/api/runs/${runId}/audio`, whose body is retired.
        audioUrl: null,
        nextAudio,
        youtubeVideoId,
        hookStartMs,
      });
    }

    const pick = await samplePuzzle({
      gameId: game.id,
      playerId,
      roundIndex: 1,
      curve: game,
      maxAttempts: game.maxAttempts,
      cooldownDays: game.puzzleCooldownDays,
      excludePuzzleIds: [],
      decadeFilter,
    });

    // An empty catalog and an exhausted one are the same thing to the player.
    if (!pick) {
      return jsonError(
        503,
        "catalog_empty",
        "No playable puzzles are available right now. Please come back after some time.",
      );
    }

    const { token, tokenHash } = mintRunToken();

    // Both inserts in one statement. Prisma's nested create wraps them in a
    // transaction, which against a remote database is BEGIN + INSERT + INSERT +
    // COMMIT — four round trips for two rows. A data-modifying CTE is one, and
    // is just as atomic.
    //
    // Columns with database defaults (status, currentRoundIndex, score, the
    // streak counters, version, startedAt) are deliberately omitted; raw SQL
    // bypasses Prisma's client-side defaults but the column defaults still apply.
    const runId = randomUUID();
    const rows = await prisma.$queryRaw<{ lives_remaining: number; current_round_index: number }[]>`
      WITH r AS (
        INSERT INTO "Run" (
          id, "gameId", "playerId", mode, "dayKey", seed, "decadeFilter",
          "livesRemaining", "maxRounds", "scoringVersion", "isRanked",
          "tokenHash", "expiresAt"
        )
        VALUES (
          ${runId}, ${game.id}, ${playerId}, ${mode}::"RunMode",
          -- NULL dayKey is what makes practice unlimited: the
          -- @@unique([playerId, gameId, dayKey]) that caps DAILY at one per day
          -- doesn't constrain NULLs, since Postgres treats them as distinct.
          NULL, ${randomBytes(16).toString("hex")}, ${decadeFilter ?? null}::"RunEra",
          ${game.livesPerRun}, NULL, ${game.scoringVersion}, false,
          ${tokenHash}, ${new Date(Date.now() + RUN_TTL_MINUTES * 60 * 1000)}
        )
        RETURNING id, "livesRemaining", "currentRoundIndex"
      ),
      rr AS (
        INSERT INTO "RunRound" (
          id, "runId", "roundIndex", "puzzleId",
          "targetPopularity", "puzzlePopularity"
        )
        SELECT ${randomUUID()}, r.id, 1, ${pick.puzzleId},
               ${pick.targetPopularity}, ${pick.popularity}
        FROM r
        RETURNING id
      )
      SELECT
        r."livesRemaining"    AS lives_remaining,
        r."currentRoundIndex" AS current_round_index
      FROM r, rr
    `;

    const created = rows[0];
    if (!created) {
      return internalErrorJson("runs.start", new Error("run insert returned no row"));
    }
    const run = {
      id: runId,
      livesRemaining: created.lives_remaining,
      currentRoundIndex: created.current_round_index,
    };

    // YOUTUBE-ONLY: stage 1 used to ride along with this response for
    // stored-audio songs:
    //
    //   const nextAudio = pick.asset ? await inlineAudioFor(pick.asset, 1, game.ladderRevision) : null;
    //
    // Every pick is a YouTube pick now, so there is nothing to inline. The
    // client reads `youtubeVideoId` below and streams.
    const nextAudio = null;

    // The token is returned exactly once and never persisted in raw form.
    return jsonOk({
      runId: run.id,
      runToken: token,
      mode,
      decadeFilter: decadeFilter ?? null,
      roundIndex: run.currentRoundIndex,
      stageReached: 1,
      attemptsRemaining: game.maxAttempts,
      livesRemaining: run.livesRemaining,
      // YOUTUBE-ONLY: was `/api/runs/${run.id}/audio`, whose body is retired.
      audioUrl: null,
      nextAudio,
      youtubeVideoId: pick.youtubeVideoId ?? null,
      hookStartMs: pick.hookStartMs ?? 0,
    });
  } catch (error) {
    return internalErrorJson("runs.start", error);
  }
}

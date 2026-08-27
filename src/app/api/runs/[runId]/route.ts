import { prisma } from "@/lib/db";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { readRunToken, runTokenMatches } from "@/lib/game/run-token";
import { deriveHint, type RoundHint } from "@/lib/game/hint";
import { computeRewards, inlineAudioFor } from "@/lib/game/attempt";

/// GET /api/runs/[runId] — the state of a run, for resume.
///
/// A reload loses everything the client was holding except the run token. This
/// hands back enough to rebuild the board without replaying any attempts: which
/// round is live, how far up the ladder it is, what has been guessed at it, and
/// the run totals.
///
/// The same disclosure rules as everywhere else apply — no puzzleId and no
/// title for a PENDING round. Past rounds in this run ARE revealed, because
/// they already resolved and the player has seen them.

export const dynamic = "force-dynamic";

type RevealedSong = {
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
};

type PastRound = {
  roundIndex: number;
  outcome: "SOLVED" | "FAILED";
  attemptsUsed: number;
  stageReached: number;
  points: number;
  /// When the round resolved, so a resumed history can show real relative times
  /// instead of inventing them. Null only for rows written before this column
  /// was populated.
  resolvedAt: string | null;
  song: RevealedSong | null;
};

type CurrentRound = {
  roundIndex: number;
  stageReached: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  /// One entry per attempt already spent at this round, oldest first. `song` is
  /// what the player named — null for a skip, and null for a guess whose puzzle
  /// has since been pulled from the catalog.
  attempts: {
    attemptIndex: number;
    isSkip: boolean;
    isCorrect: boolean;
    song: { title: string; artist: string } | null;
  }[];
  hint: RoundHint | null;
};

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/runs/[runId]">,
): Promise<Response> {
  const { runId } = await ctx.params;

  try {
    const token = readRunToken(request);
    if (!token) {
      return jsonError(401, "missing_run_token", "Authorization: Bearer <run token> required.");
    }

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        tokenHash: true,
        status: true,
        mode: true,
        currentRoundIndex: true,
        livesRemaining: true,
        score: true,
        xpEarned: true,
        currentStreak: true,
        bestStreak: true,
        roundsSolved: true,
        roundsFailed: true,
        expiresAt: true,
        game: {
          select: {
            slug: true,
            maxAttempts: true,
            revealLadder: true,
            ladderRevision: true,
          },
        },
      },
    });

    // Indistinguishable from a wrong token, same as the other run routes.
    if (!run || !runTokenMatches(token, run.tokenHash)) {
      return jsonError(404, "not_found", "No such run.");
    }

    const rounds = await prisma.runRound.findMany({
      where: { runId },
      orderBy: { roundIndex: "asc" },
      select: {
        roundIndex: true,
        outcome: true,
        stageReached: true,
        attemptsUsed: true,
        points: true,
        resolvedAt: true,
        // The pending round's song is loaded because deriveHint needs it. It
        // must not reach the response — see the PENDING branch below, which
        // reads it only through deriveHint.
        puzzle: {
          select: {
            song: {
              select: {
                title: true,
                artist: true,
                album: true,
                releaseYear: true,
                decade: true,
                genres: true,
              },
            },
            // Only the current round's asset is used, but selecting it here is
            // free — it rides the join this query already makes — and it lets a
            // resume inline its audio instead of making a second request.
            assets: {
              where: { kind: "AUDIO_CLIP" as const },
              select: {
                storageKey: true,
                stageByteOffsets: true,
                byteSize: true,
                ladderRevision: true,
              },
            },
          },
        },
        guesses: {
          orderBy: { attemptIndex: "asc" },
          select: {
            attemptIndex: true,
            isSkip: true,
            isCorrect: true,
            guessedPuzzleId: true,
          },
        },
      },
    });

    const currentRound = rounds.find(
      (round) => round.roundIndex === run.currentRoundIndex && round.outcome === "PENDING",
    );

    // Guess.guessedPuzzleId is a plain column with no relation to Puzzle, so the
    // names behind the current round's guesses need their own lookup. Only the
    // current round's are needed — past rounds render from their own reveal.
    const guessedIds = [
      ...new Set(
        (currentRound?.guesses ?? [])
          .map((guess) => guess.guessedPuzzleId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const guessedSongs =
      guessedIds.length > 0
        ? await prisma.song.findMany({
            where: { puzzleId: { in: guessedIds } },
            select: { puzzleId: true, title: true, artist: true },
          })
        : [];

    const guessedByPuzzleId = new Map(guessedSongs.map((song) => [song.puzzleId, song]));

    const current: CurrentRound | null = currentRound
      ? {
          roundIndex: currentRound.roundIndex,
          stageReached: currentRound.stageReached,
          attemptsUsed: currentRound.attemptsUsed,
          attemptsRemaining: run.game.maxAttempts - currentRound.attemptsUsed,
          attempts: currentRound.guesses.map((guess) => {
            const song = guess.guessedPuzzleId
              ? guessedByPuzzleId.get(guess.guessedPuzzleId)
              : undefined;
            return {
              attemptIndex: guess.attemptIndex,
              isSkip: guess.isSkip,
              isCorrect: guess.isCorrect,
              song: song ? { title: song.title, artist: song.artist } : null,
            };
          }),
          hint: currentRound.puzzle.song
            ? deriveHint(currentRound.puzzle.song, currentRound.attemptsUsed)
            : null,
        }
      : null;

    const past: PastRound[] = rounds
      .filter((round) => round.outcome !== "PENDING")
      .map((round) => ({
        roundIndex: round.roundIndex,
        // Narrowed by the filter above, which TypeScript can't see through.
        outcome: round.outcome as "SOLVED" | "FAILED",
        attemptsUsed: round.attemptsUsed,
        stageReached: round.stageReached,
        points: round.points,
        resolvedAt: round.resolvedAt?.toISOString() ?? null,
        song: round.puzzle.song
          ? {
              title: round.puzzle.song.title,
              artist: round.puzzle.song.artist,
              album: round.puzzle.song.album,
              releaseYear: round.puzzle.song.releaseYear,
            }
          : null,
      }));

    // Pure now, and derived from rows this handler already holds — it used to be
    // an extra query for two numbers that were sitting right here.
    const rewards = computeRewards({
      score: run.score,
      bestStreak: run.bestStreak,
      roundsSolved: run.roundsSolved,
      hasPerfectSync: rounds.some(
        (round) => round.outcome === "SOLVED" && round.attemptsUsed === 1,
      ),
    });

    return jsonOk({
      runId,
      gameSlug: run.game.slug,
      mode: run.mode,
      runStatus: run.status,
      maxAttempts: run.game.maxAttempts,
      revealLadder: toLadder(run.game.revealLadder),
      livesRemaining: run.livesRemaining,
      xpEarned: run.xpEarned,
      currentStreak: run.currentStreak,
      bestStreak: run.bestStreak,
      roundsSolved: run.roundsSolved,
      roundsFailed: run.roundsFailed,
      expiresAt: run.expiresAt,
      // Null once the run is over — there is no more audio to earn.
      audioUrl: run.status === "IN_PROGRESS" && current ? `/api/runs/${runId}/audio` : null,
      // A resume used to be two requests: this one, then /audio. The asset came
      // along with the round above, so the bytes can too.
      nextAudio:
        run.status === "IN_PROGRESS" && currentRound?.puzzle.assets[0]
          ? await inlineAudioFor(
              currentRound.puzzle.assets[0],
              currentRound.stageReached,
              run.game.ladderRevision,
            )
          : null,
      current,
      past,
      ...rewards,
    });
  } catch (error) {
    return internalErrorJson("runs.get", error);
  }
}

/// Game.revealLadder is Json, so narrow it rather than trusting the column —
/// same treatment it gets in src/lib/games.ts.
function toLadder(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((ms): ms is number => typeof ms === "number");
}

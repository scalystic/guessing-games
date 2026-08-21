"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  fetchRevealAudio,
  fetchRunState,
  fetchStageAudio,
  newIdempotencyKey,
  skipRound,
  startRun,
  submitGuess,
  type AttemptResult,
  type CatalogMatch,
  type Reveal,
  type RoundHint,
  type RunStatus,
} from "@/lib/api/runs";
import { clearStoredRun, loadStoredRun, saveStoredRun } from "@/lib/run-storage";

/// The run loop, driven entirely by the server.
///
/// Everything that used to be computed here — the target song, the stage, the
/// score, whether a guess was right — now arrives from POST /api/runs and the
/// attempt responses. The client's job is to render what it is told and to hold
/// exactly two things the server can't: what the player typed at each attempt
/// (the API echoes an outcome, not a label), and the object URL for the audio
/// bytes it has already been handed.
///
/// One asymmetry worth knowing when reading this: resolving a round ALSO opens
/// the next one server-side, in the same transaction. So by the time the result
/// panel appears, `Run.currentRoundIndex` has already moved on and
/// `nextAudioUrl` points at the new round's stage 1. `nextRound()` therefore
/// makes no request beyond fetching that audio.

export type RoundStatus = "PENDING" | "SOLVED" | "FAILED";

export type GuessRecord = {
  /// What the player named. Null for a skip.
  song: { title: string; artist: string } | null;
  /// The puzzle they named, so the typeahead can stop offering it. Null for a
  /// skip, and null for guesses recovered from a resume — the resume payload
  /// carries labels for display but not the ids of wrong guesses.
  puzzleId: string | null;
  correct: boolean;
  skipped: boolean;
  at: number;
};

export type RoundHistoryEntry = {
  song: { title: string; artist: string; album: string | null; releaseYear: number | null };
  solved: boolean;
  attemptsUsed: number;
  at: number;
};

export type GameConfig = {
  gameSlug: string;
  revealLadder: number[];
  maxAttempts: number;
};

/// `starting` covers both a fresh run and a resume — the board can't be drawn
/// either way. `error` is terminal until the player retries.
export type GamePhase = "starting" | "ready" | "error";

export function useMelodleGame({ gameSlug, revealLadder, maxAttempts }: GameConfig) {
  const [phase, setPhase] = useState<GamePhase>("starting");
  const [error, setError] = useState<string | null>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("IN_PROGRESS");

  // Current round.
  const [roundIndex, setRoundIndex] = useState(1);
  const [stage, setStage] = useState(1);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [guesses, setGuesses] = useState<GuessRecord[]>([]);
  const [status, setStatus] = useState<RoundStatus>("PENDING");
  const [hint, setHint] = useState<RoundHint | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [lastPoints, setLastPoints] = useState<number | null>(null);

  // Run totals — all server-owned.
  const [lives, setLives] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [roundsSolved, setRoundsSolved] = useState(0);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [pending, setPending] = useState(false);

  /// The whole clip for the round that just resolved — what the result panel
  /// plays back. Kept apart from `audioUrl`, which still holds only the prefix
  /// this round actually earned: a stage-1 solve unlocked ~200ms, which is not
  /// something worth offering a play button for.
  const [revealAudioUrl, setRevealAudioUrl] = useState<string | null>(null);
  const [revealAudioLoading, setRevealAudioLoading] = useState(false);

  // The token never enters React state: it is not rendered, and keeping it in a
  // ref means a stale closure can't hand an old run's token to a new run.
  const tokenRef = useRef<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const revealObjectUrlRef = useRef<string | null>(null);
  /// Bumped on every run start and round change. An audio fetch that resolves
  /// after its generation is stale gets discarded instead of playing the
  /// previous round's clip over the current one.
  const generationRef = useRef(0);
  /// Guards the mount effect against a second invocation.
  ///
  /// POST /api/runs is not idempotent — it creates a row. React's development
  /// StrictMode mounts, unmounts and remounts every component, so without this
  /// each page load starts TWO runs and abandons one. The generation counter
  /// keeps state coherent when that happens, but it can't un-create the run.
  const initializedRef = useRef(false);

  const releaseAudio = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const releaseRevealAudio = useCallback(() => {
    if (revealObjectUrlRef.current) {
      URL.revokeObjectURL(revealObjectUrlRef.current);
      revealObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => releaseAudio, [releaseAudio]);
  useEffect(() => releaseRevealAudio, [releaseRevealAudio]);

  /// Pull the audio the current round has earned and swap it in.
  const loadAudio = useCallback(
    async (id: string, generation: number) => {
      const token = tokenRef.current;
      if (!token) return;

      setAudioLoading(true);
      try {
        const audio = await fetchStageAudio(id, token);
        if (generation !== generationRef.current) {
          // Superseded while in flight. Revoke immediately or it leaks.
          URL.revokeObjectURL(audio.objectUrl);
          return;
        }
        releaseAudio();
        objectUrlRef.current = audio.objectUrl;
        setAudioUrl(audio.objectUrl);
        // The server's stage is authoritative — trust the header over local
        // bookkeeping if they ever disagree.
        setStage(audio.stage);
      } catch (cause) {
        if (generation !== generationRef.current) return;
        setAudioUrl(null);
        setError(messageFor(cause, "Couldn't load the clip for this round."));
      } finally {
        if (generation === generationRef.current) setAudioLoading(false);
      }
    },
    [releaseAudio],
  );

  /// Pull the full clip for the round that just resolved.
  ///
  /// Best-effort on purpose: a failure here costs the player a play button on a
  /// round they already finished, so it must not raise the run-level error that
  /// a failed stage fetch does.
  const loadRevealAudio = useCallback(
    async (id: string, generation: number) => {
      const token = tokenRef.current;
      if (!token) return;

      setRevealAudioLoading(true);
      try {
        const audio = await fetchRevealAudio(id, token);
        if (generation !== generationRef.current) {
          URL.revokeObjectURL(audio.objectUrl);
          return;
        }
        releaseRevealAudio();
        revealObjectUrlRef.current = audio.objectUrl;
        setRevealAudioUrl(audio.objectUrl);
        // Deliberately not touching `stage`: the reveal always reports the last
        // stage, which would misdraw the ladder the panel sits on top of.
      } catch {
        if (generation !== generationRef.current) return;
        setRevealAudioUrl(null);
      } finally {
        if (generation === generationRef.current) setRevealAudioLoading(false);
      }
    },
    [releaseRevealAudio],
  );

  const resetRoundView = useCallback(() => {
    setGuesses([]);
    setStatus("PENDING");
    setHint(null);
    setReveal(null);
    setLastPoints(null);
    setAttemptsUsed(0);
    setStage(1);
    releaseRevealAudio();
    setRevealAudioUrl(null);
    setRevealAudioLoading(false);
  }, [releaseRevealAudio]);

  /// Start a brand-new run, replacing anything stored.
  const begin = useCallback(async () => {
    const generation = ++generationRef.current;

    setPhase("starting");
    setError(null);
    releaseAudio();
    setAudioUrl(null);
    resetRoundView();
    // roundHistory is deliberately NOT cleared. Everything else here is a Run
    // column and has to go back to what the new run says, but the played-songs
    // list is a record of this visit — a run ending (catalog exhausted, or the
    // player hitting "Play Now") is not a reason for songs they just heard to
    // vanish off the bottom of the screen. A resume replaces it wholesale from
    // the server, so it can't drift into a duplicate of the run's own rounds.
    setRoundsPlayed(0);
    setRoundsSolved(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);

    try {
      const started = await startRun(gameSlug, "PRACTICE");
      if (generation !== generationRef.current) return;

      tokenRef.current = started.runToken;
      saveStoredRun({
        runId: started.runId,
        runToken: started.runToken,
        gameSlug,
      });

      setRunId(started.runId);
      setRunStatus("IN_PROGRESS");
      setRoundIndex(started.roundIndex);
      setStage(started.stageReached);
      setLives(started.livesRemaining);
      setPhase("ready");

      await loadAudio(started.runId, generation);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setPhase("error");
      setError(
        messageFor(
          cause,
          "Couldn't start a run. The catalog may be empty — ingest some songs first.",
        ),
      );
    }
  }, [gameSlug, loadAudio, releaseAudio, resetRoundView]);

  /// Rehydrate from a stored run, or start a new one if there isn't a usable
  /// one. Runs once on mount.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // No `cancelled` flag here, deliberately. Pairing one with the guard above
    // is a trap: StrictMode mounts, runs the cleanup (setting cancelled), then
    // remounts — and the remount hits the guard and returns, so the only
    // invocation still in flight is one that has been told to discard its
    // result. Nothing would ever hydrate. generationRef already discards work
    // that a later begin()/nextRound() has superseded, which is the staleness
    // that actually matters; a setState after a real unmount is a no-op.
    async function resumeOrStart() {
      const stored = loadStoredRun(gameSlug);
      if (!stored) {
        void begin();
        return;
      }

      const generation = ++generationRef.current;
      tokenRef.current = stored.runToken;

      try {
        const state = await fetchRunState(stored.runId, stored.runToken);
        if (generation !== generationRef.current) return;

        // A finished run is not resumable — nothing to guess at.
        if (state.runStatus !== "IN_PROGRESS" || !state.current) {
          clearStoredRun();
          void begin();
          return;
        }

        setRunId(state.runId);
        setRunStatus(state.runStatus);
        setRoundIndex(state.current.roundIndex);
        setStage(state.current.stageReached);
        setAttemptsUsed(state.current.attemptsUsed);
        setGuesses(
          state.current.attempts.map((attempt) => ({
            song: attempt.song,
            puzzleId: null,
            correct: attempt.isCorrect,
            skipped: attempt.isSkip,
            // The real timestamps aren't in the payload and nothing renders
            // them for the current round; only roundHistory shows relative time.
            at: 0,
          })),
        );
        setHint(state.current.hint);
        setStatus("PENDING");
        setReveal(null);
        setLastPoints(null);

        setLives(state.livesRemaining);
        setScore(state.score);
        setStreak(state.currentStreak);
        setBestStreak(state.bestStreak);
        setRoundsSolved(state.roundsSolved);
        setRoundsPlayed(state.roundsSolved + state.roundsFailed);
        setRoundHistory(
          state.past
            .filter((round) => round.song !== null)
            .map((round) => ({
              song: round.song!,
              solved: round.outcome === "SOLVED",
              attemptsUsed: round.attemptsUsed,
              // Real resolution time from the server. Falling back to 0 here
              // would render as "496474h ago" — the epoch, not "unknown".
              at: round.resolvedAt ? Date.parse(round.resolvedAt) : Date.now(),
            }))
            // Newest first, matching the order live rounds are prepended in.
            .reverse(),
        );

        setPhase("ready");
        await loadAudio(state.runId, generation);
      } catch (cause) {
        if (generation !== generationRef.current) return;
        // A 404 is the common case: the run expired, or the database was reset
        // under a token we still had. Either way, start fresh rather than
        // stranding the player on an error screen.
        if (cause instanceof ApiError && cause.status === 404) {
          clearStoredRun();
          void begin();
          return;
        }
        setPhase("error");
        setError(messageFor(cause, "Couldn't resume your run."));
      }
    }

    void resumeOrStart();
    // Mount-only: begin/loadAudio are stable, and re-running this on any change
    // would abandon a live run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSlug]);

  /// Fold an attempt response into local state.
  const applyResult = useCallback(
    (result: AttemptResult, record: GuessRecord) => {
      setGuesses((previous) => [...previous, record]);
      setAttemptsUsed(result.attemptsUsed);
      setStage(result.stageReached);
      setLives(result.livesRemaining);
      setRunStatus(result.runStatus);
      setHint(result.hint);
      // Server-owned, both of them. The streak rule (scoring/v1.ts) is not
      // re-implemented here — this hook used to derive it from `stageReached`
      // and quietly disagreed with the run the moment that rule changed.
      setStreak(result.currentStreak);
      setBestStreak(result.bestStreak);

      if (result.outcome === "PENDING") return;

      // Round resolved. The server has already opened the next one (or finished
      // the run); the result panel is what the player sees until they advance.
      setStatus(result.outcome);
      setReveal(result.reveal);
      setLastPoints(result.points);
      setRoundsPlayed((count) => count + 1);

      if (result.points !== null) setScore((current) => current + result.points!);

      if (result.outcome === "SOLVED") setRoundsSolved((count) => count + 1);

      if (result.reveal) {
        setRoundHistory((history) => [
          {
            song: result.reveal!,
            solved: result.outcome === "SOLVED",
            attemptsUsed: result.attemptsUsed,
            at: Date.now(),
          },
          ...history,
        ]);
      }
    },
    [],
  );

  const guess = useCallback(
    async (match: CatalogMatch) => {
      const id = runId;
      const token = tokenRef.current;
      if (!id || !token || pending || status !== "PENDING") return;

      const generation = generationRef.current;
      setPending(true);
      try {
        const result = await submitGuess(id, token, {
          guessedPuzzleId: match.puzzleId,
          rawInput: `${match.title} — ${match.artist}`,
          idempotencyKey: newIdempotencyKey(),
        });
        if (generation !== generationRef.current) return;

        applyResult(result, {
          song: { title: match.title, artist: match.artist },
          puzzleId: match.puzzleId,
          correct: result.outcome === "SOLVED",
          skipped: false,
          at: Date.now(),
        });

        if (result.outcome === "PENDING") await loadAudio(id, generation);
        else await loadRevealAudio(id, generation);
      } catch (cause) {
        if (generation !== generationRef.current) return;
        setError(messageFor(cause, "That guess didn't go through."));
      } finally {
        setPending(false);
      }
    },
    [runId, pending, status, applyResult, loadAudio, loadRevealAudio],
  );

  const skip = useCallback(async () => {
    const id = runId;
    const token = tokenRef.current;
    if (!id || !token || pending || status !== "PENDING") return;

    const generation = generationRef.current;
    setPending(true);
    try {
      const result = await skipRound(id, token, newIdempotencyKey());
      if (generation !== generationRef.current) return;

      applyResult(result, {
        song: null,
        puzzleId: null,
        correct: false,
        skipped: true,
        at: Date.now(),
      });

      if (result.outcome === "PENDING") await loadAudio(id, generation);
      else await loadRevealAudio(id, generation);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(messageFor(cause, "That skip didn't go through."));
    } finally {
      setPending(false);
    }
  }, [runId, pending, status, applyResult, loadAudio, loadRevealAudio]);

  /// Move to the round the server already opened when this one resolved. If the
  /// run itself finished, this starts a new one.
  const nextRound = useCallback(async () => {
    if (runStatus !== "IN_PROGRESS") {
      await begin();
      return;
    }

    const id = runId;
    if (!id) return;

    const generation = ++generationRef.current;
    resetRoundView();
    setRoundIndex((index) => index + 1);
    releaseAudio();
    setAudioUrl(null);
    await loadAudio(id, generation);
  }, [runStatus, runId, begin, resetRoundView, releaseAudio, loadAudio]);

  const restartRun = useCallback(() => {
    void begin();
  }, [begin]);

  const revealMs = revealLadder[stage - 1] ?? revealLadder[0] ?? 0;
  const totalMs = revealLadder[revealLadder.length - 1] ?? 0;

  return {
    phase,
    error,
    dismissError: useCallback(() => setError(null), []),

    runId,
    runStatus,
    roundIndex,
    stage,
    attemptsUsed,
    attemptsRemaining: maxAttempts - attemptsUsed,
    revealMs,
    totalMs,
    revealLadder,
    maxAttempts,
    guesses,
    status,
    hint,
    reveal,
    lastPoints,

    lives,
    streak,
    bestStreak,
    score,
    roundsPlayed,
    roundsSolved,
    roundHistory,

    audioUrl,
    audioLoading,
    revealAudioUrl,
    revealAudioLoading,
    pending,

    guess,
    skip,
    nextRound,
    restartRun,
  };
}

/// Prefer the server's message — "No playable puzzles are available right now."
/// is far more useful than a generic failure, and the API only ever returns
/// messages that are safe to show.
function messageFor(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message;
  return fallback;
}

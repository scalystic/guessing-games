"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchRevealAudio,
  fetchStageAudio,
  newIdempotencyKey,
  skipRound,
  startRun,
  submitGuess,
  type AttemptResult,
  type CatalogMatch,
  type Reveal,
} from "@/lib/api/runs";
import type { GuessRecord } from "@/hooks/useMelodleGame";

/// A standalone practice round, independent of the page's main run.
///
/// useMelodleGame persists to one shared localStorage slot (sargam.run.v1) —
/// there is only ever one "current run" per gameSlug. Mounting a second
/// instance of it here, for an overlay that sits on top of the still-mounted
/// home page, would race that same slot: whichever instance last wrote it
/// wins, and the other is left holding stale in-memory state for a run the
/// server has since moved on. This hook calls the exact same endpoints but
/// keeps the run entirely in local state, so it can play out alongside the
/// page's real run without ever touching it.

export type PendingAction = "guess" | "skip" | null;

export function useLocalPracticeRound(gameSlug: string) {
  const [runId, setRunId] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const [stage, setStage] = useState(1);
  const [status, setStatus] = useState<"PENDING" | "SOLVED" | "FAILED">("PENDING");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [guesses, setGuesses] = useState<GuessRecord[]>([]);
  const [guessedPuzzleIds, setGuessedPuzzleIds] = useState<Set<string>>(new Set());

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  const releaseAudio = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => releaseAudio, [releaseAudio]);

  const loadAudio = useCallback(
    async (id: string, generation: number, wantReveal: boolean) => {
      const token = tokenRef.current;
      if (!token) return;
      setAudioLoading(true);
      try {
        const audio = wantReveal ? await fetchRevealAudio(id, token) : await fetchStageAudio(id, token);
        if (generation !== generationRef.current) {
          URL.revokeObjectURL(audio.objectUrl);
          return;
        }
        releaseAudio();
        objectUrlRef.current = audio.objectUrl;
        setAudioUrl(audio.objectUrl);
      } catch {
        if (generation === generationRef.current) setAudioUrl(null);
      } finally {
        if (generation === generationRef.current) setAudioLoading(false);
      }
    },
    [releaseAudio],
  );

  /// Starts a brand-new practice round, discarding whatever the previous one
  /// was doing. Used both to begin on mount and to hand out a fresh song —
  /// e.g. when a multiplayer "round" moves on to its next track.
  const startNewRound = useCallback(async () => {
    const generation = ++generationRef.current;
    try {
      const started = await startRun(gameSlug, "PRACTICE");
      if (generation !== generationRef.current) return;
      setStatus("PENDING");
      setReveal(null);
      setGuesses([]);
      setGuessedPuzzleIds(new Set());
      tokenRef.current = started.runToken;
      setRunId(started.runId);
      setStage(started.stageReached);
      await loadAudio(started.runId, generation, false);
    } catch (cause) {
      if (generation === generationRef.current) {
        setError(cause instanceof Error ? cause.message : "Couldn't start a round.");
      }
    }
  }, [gameSlug, loadAudio]);

  useEffect(() => {
    // Runs once on mount (and again whenever gameSlug itself changes) —
    // subsequent rounds come from calling startNewRound() directly.
    async function begin() {
      await startNewRound();
    }
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSlug]);

  const guess = useCallback(
    async (match: CatalogMatch): Promise<AttemptResult | null> => {
      const id = runId;
      const token = tokenRef.current;
      if (!id || !token || pendingAction || status !== "PENDING") return null;

      const generation = generationRef.current;
      setPendingAction("guess");
      try {
        const result = await submitGuess(id, token, {
          guessedPuzzleId: match.puzzleId,
          rawInput: `${match.title} — ${match.artist}`,
          idempotencyKey: newIdempotencyKey(),
        });
        if (generation !== generationRef.current) return null;

        setStage(result.stageReached);
        setGuessedPuzzleIds((prev) => new Set(prev).add(match.puzzleId));
        setGuesses((prev) => [
          ...prev,
          {
            song: { title: match.title, artist: match.artist },
            puzzleId: match.puzzleId,
            correct: result.outcome === "SOLVED",
            skipped: false,
            at: Date.now(),
          },
        ]);

        if (result.outcome === "PENDING") {
          await loadAudio(id, generation, false);
        } else {
          setStatus(result.outcome);
          setReveal(result.reveal);
          await loadAudio(id, generation, true);
        }
        return result;
      } catch (cause) {
        if (generation === generationRef.current) setError(cause instanceof Error ? cause.message : "That guess didn't go through.");
        return null;
      } finally {
        if (generation === generationRef.current) setPendingAction(null);
      }
    },
    [runId, pendingAction, status, loadAudio],
  );

  const skip = useCallback(async () => {
    const id = runId;
    const token = tokenRef.current;
    if (!id || !token || pendingAction || status !== "PENDING") return;

    const generation = generationRef.current;
    setPendingAction("skip");
    try {
      const result = await skipRound(id, token, newIdempotencyKey());
      if (generation !== generationRef.current) return;

      setStage(result.stageReached);
      setGuesses((prev) => [...prev, { song: null, puzzleId: null, correct: false, skipped: true, at: Date.now() }]);
      if (result.outcome === "PENDING") {
        await loadAudio(id, generation, false);
      } else {
        setStatus(result.outcome);
        setReveal(result.reveal);
        await loadAudio(id, generation, true);
      }
    } catch (cause) {
      if (generation === generationRef.current) setError(cause instanceof Error ? cause.message : "That skip didn't go through.");
    } finally {
      if (generation === generationRef.current) setPendingAction(null);
    }
  }, [runId, pendingAction, status, loadAudio]);

  return {
    runId,
    stage,
    status,
    reveal,
    guesses,
    guessedPuzzleIds,
    audioUrl,
    audioLoading,
    pendingAction,
    error,
    guess,
    skip,
    startNewRound,
  };
}

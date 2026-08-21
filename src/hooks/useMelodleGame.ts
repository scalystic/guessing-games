"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { SONGS, type Song } from "@/data/songs";

// Mirrors Game.revealLadder / Game.maxAttempts / the scoring formula in
// docs/game-engine.md so the real backend can slot in without changing the
// UI's mental model.
export const REVEAL_LADDER_MS = [1000, 2000, 4000, 7000, 11000, 16000];
export const MAX_ATTEMPTS = REVEAL_LADDER_MS.length;
const STAGE_BASE = [1000, 800, 600, 400, 250, 100];
const START_LIVES = 3;

export type RoundStatus = "PENDING" | "SOLVED" | "FAILED";

export type GuessRecord = {
  song: Song | null;
  correct: boolean;
  skipped: boolean;
  at: number;
};

// One entry per finished round — distinct from GuessRecord, which is one
// entry per attempt *within* the current round.
export type RoundHistoryEntry = {
  song: Song;
  solved: boolean;
  attemptsUsed: number;
  at: number;
};

function shuffledIndices(length: number) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function useMelodleGame() {
  // Populated lazily from nextSongIndex (an event handler, never render) so
  // the server and client never need to agree on a random shuffle.
  const songOrder = useRef<number[]>([]);
  const songCursor = useRef(0);

  // Deterministic first song — same on server and client — so nothing
  // random has to happen during the initial render just to pick one.
  const [targetIndex, setTargetIndex] = useState(0);
  const [stage, setStage] = useState(1);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [guesses, setGuesses] = useState<GuessRecord[]>([]);
  const [status, setStatus] = useState<RoundStatus>("PENDING");
  const [lives, setLives] = useState(START_LIVES);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [roundsSolved, setRoundsSolved] = useState(0);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);

  const target = SONGS[targetIndex];
  const revealMs = REVEAL_LADDER_MS[stage - 1];

  const nextSongIndex = useCallback(() => {
    if (songCursor.current >= songOrder.current.length) {
      songOrder.current = shuffledIndices(SONGS.length);
      songCursor.current = 0;
    }
    const idx = songOrder.current[songCursor.current];
    songCursor.current += 1;
    return idx;
  }, []);

  const resetRoundState = useCallback(() => {
    setStage(1);
    setAttemptsUsed(0);
    setGuesses([]);
    setStatus("PENDING");
    setLastPoints(null);
  }, []);

  const nextRound = useCallback(() => {
    setTargetIndex(nextSongIndex());
    resetRoundState();
  }, [nextSongIndex, resetRoundState]);

  const restartRun = useCallback(() => {
    setLives(START_LIVES);
    setStreak(0);
    setScore(0);
    setRoundsPlayed(0);
    setRoundsSolved(0);
    setTargetIndex(nextSongIndex());
    resetRoundState();
  }, [nextSongIndex, resetRoundState]);

  const submitGuess = useCallback(
    (song: Song | null, skip = false) => {
      if (status !== "PENDING") return;
      const correct = !skip && song?.id === target.id;
      setGuesses((g) => [...g, { song, correct, skipped: skip, at: Date.now() }]);

      if (correct) {
        const points = Math.round(
          STAGE_BASE[stage - 1] * (1 + Math.min(0.1 * streak, 0.5)),
        );
        setScore((s) => s + points);
        setLastPoints(points);
        setStreak((s) => {
          const n = s + 1;
          setBestStreak((b) => Math.max(b, n));
          return n;
        });
        setStatus("SOLVED");
        setRoundsPlayed((r) => r + 1);
        setRoundsSolved((r) => r + 1);
        setRoundHistory((h) => [
          { song: target, solved: true, attemptsUsed: attemptsUsed + 1, at: Date.now() },
          ...h,
        ]);
        return;
      }

      const attempts = attemptsUsed + 1;
      setAttemptsUsed(attempts);
      if (attempts >= MAX_ATTEMPTS) {
        setStatus("FAILED");
        setStreak(0);
        setLives((l) => Math.max(0, l - 1));
        setRoundsPlayed((r) => r + 1);
        setRoundHistory((h) => [
          { song: target, solved: false, attemptsUsed: attempts, at: Date.now() },
          ...h,
        ]);
      } else {
        setStage((s) => s + 1);
      }
    },
    [status, target, stage, attemptsUsed, streak],
  );

  const hint = useMemo(() => {
    if (attemptsUsed < 2) return null;
    const decade = `${Math.floor(target.year / 10) * 10}s`;
    if (attemptsUsed < 4) return { decade, genre: target.genre };
    return {
      decade,
      genre: target.genre,
      firstLetter: target.title[0].toUpperCase(),
    };
  }, [attemptsUsed, target]);

  return {
    target,
    stage,
    attemptsUsed,
    attemptsRemaining: MAX_ATTEMPTS - attemptsUsed,
    revealMs,
    guesses,
    status,
    lives,
    streak,
    bestStreak,
    score,
    lastPoints,
    roundsPlayed,
    roundsSolved,
    roundHistory,
    hint,
    submitGuess,
    nextRound,
    restartRun,
  };
}

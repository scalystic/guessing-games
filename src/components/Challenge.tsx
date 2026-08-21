"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SONGS, type Song } from "@/data/songs";
import { PlayerBar } from "./PlayerBar";
import { GuessAutocomplete } from "./GuessAutocomplete";

const ROUND_SECONDS = 60;
const CLIP_MS = 2000; // short, fixed clip — a speed round, not the reveal ladder
const BEST_KEY = "sargam-challenge-best-v1";

type Phase = "idle" | "playing" | "done";

function shuffledIndices(length: number) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Only ever mounts after a click, never during SSR/hydration, so this read
// has no server value to disagree with.
function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function Challenge({ accent }: { accent: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [correctCount, setCorrectCount] = useState(0);
  const [best, setBest] = useState(loadBest);
  const [songIndex, setSongIndex] = useState(0);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);

  const orderRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const correctCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excludeIds = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  function nextSong() {
    if (cursorRef.current >= orderRef.current.length) {
      orderRef.current = shuffledIndices(SONGS.length);
      cursorRef.current = 0;
    }
    setSongIndex(orderRef.current[cursorRef.current]);
    cursorRef.current += 1;
  }

  function finish() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("done");
    setBest((b) => {
      const nb = Math.max(b, correctCountRef.current);
      try {
        localStorage.setItem(BEST_KEY, String(nb));
      } catch {
        // storage disabled — the round still works, just won't remember a best
      }
      return nb;
    });
  }

  function start() {
    orderRef.current = shuffledIndices(SONGS.length);
    cursorRef.current = 0;
    correctCountRef.current = 0;
    nextSong();
    setCorrectCount(0);
    setTimeLeft(ROUND_SECONDS);
    setFlash(null);
    setPhase("playing");

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          finish();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  function submit(song: Song | null, skip = false) {
    if (phase !== "playing") return;
    const target = SONGS[songIndex];
    const correct = !skip && song?.id === target.id;

    if (correct) {
      correctCountRef.current += 1;
      setCorrectCount(correctCountRef.current);
    }
    setFlash(correct ? "correct" : "wrong");
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlash(null), 500);
    nextSong();
  }

  const target = SONGS[songIndex];

  return (
    <div className="flex flex-col gap-4">
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="text-3xl" aria-hidden="true">
            ⏱️
          </span>
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
            60-Second Sprint
          </p>
          <p className="max-w-xs text-sm text-(--text-dim)">
            Guess as many songs as you can before the clock runs out. A wrong guess or a skip just
            moves you to the next one — no penalty, just speed.
          </p>
          {best > 0 && <p className="text-xs text-(--text-faint)">Your best on this device: {best}</p>}
          <button
            type="button"
            onClick={start}
            className="mt-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-black transition hover:scale-[1.02] active:scale-95"
            style={{ background: accent }}
          >
            Start
          </button>
        </div>
      )}

      {phase === "playing" && (
        <>
          <div className="flex items-center justify-between text-sm font-semibold text-(--text)">
            <span>⏱️ {timeLeft}s</span>
            <span>✓ {correctCount} solved</span>
          </div>

          <PlayerBar song={target} revealMs={CLIP_MS} accent={accent} locked={false} />

          <GuessAutocomplete
            songs={SONGS}
            excludeIds={excludeIds}
            accent={accent}
            onGuess={(song) => submit(song)}
            onSkip={() => submit(null, true)}
          />

          <p
            className="h-4 text-center text-sm font-bold transition-opacity"
            style={{
              color: flash === "correct" ? "#34d399" : "#f87171",
              opacity: flash ? 1 : 0,
            }}
          >
            {flash === "correct" ? "✓ Correct!" : "Next song…"}
          </p>
        </>
      )}

      {phase === "done" && (
        <div className="flex flex-col items-center gap-1.5 py-2 text-center">
          <span className="text-3xl" aria-hidden="true">
            🏁
          </span>
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
            Time&apos;s up!
          </p>
          <p className="text-sm text-(--text-dim)">You solved {correctCount} songs.</p>
          <p className="text-xs text-(--text-faint)">Best on this device: {best}</p>
          <button
            type="button"
            onClick={start}
            className="mt-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-black transition hover:scale-[1.02] active:scale-95"
            style={{ background: accent }}
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}

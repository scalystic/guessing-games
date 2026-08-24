"use client";

import { useEffect, useRef, useState } from "react";
import type { RoundStatus } from "@/hooks/useMelodleGame";
import type { Reveal } from "@/lib/api/runs";

type Props = {
  reveal: Reveal;
  status: RoundStatus;
  attemptsUsed: number;
  maxAttempts: number;
  revealMs: number;
  points: number | null;
  guesses: { correct: boolean; skipped: boolean }[];
  streak: number;
  score: number;
  fullAudioUrl: string | null;
  audioLoading: boolean;
  onNext: () => void;
};

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  return `${seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} seconds`;
}

export function ResultPanel({
  reveal,
  status,
  attemptsUsed,
  maxAttempts,
  revealMs,
  points,
  guesses,
  streak,
  score,
  fullAudioUrl,
  audioLoading,
  onNext,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const won = status === "SOLVED";

  useEffect(() => {
    if (!fullAudioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(fullAudioUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    const done = () => setIsPlaying(false);
    audio.addEventListener("ended", done);

    return () => {
      audio.removeEventListener("ended", done);
      audio.pause();
      audioRef.current = null;
    };
  }, [fullAudioUrl]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.currentTime = 0;
    setIsPlaying(true);
    void audio.play().catch(() => setIsPlaying(false));
  }

  function share() {
    const squares = guesses
      .map((guess) => (guess.correct ? "🟩" : guess.skipped ? "⬛" : "🟥"))
      .join("");
    const text = `Sargam ${won ? attemptsUsed || 1 : "X"}/${maxAttempts}\n${squares}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-(--scrim) p-4" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="panel-in w-full max-w-md overflow-hidden rounded-[14px] border border-(--hairline) bg-(--surface-strong) shadow-2xl">
        <div className="grid gap-6 p-5 sm:grid-cols-[132px_1fr] sm:p-6">
          <div className="mx-auto flex flex-col items-center sm:mx-0">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={audioLoading || !fullAudioUrl}
              className="relative flex h-32 w-32 items-center justify-center rounded-full border-[10px] border-[#111520] bg-[repeating-radial-gradient(circle,#2e3444_0_2px,#121620_3px_6px)] text-[#151925] shadow-lg transition-opacity duration-200 disabled:cursor-wait disabled:opacity-65"
              aria-label={isPlaying ? "Stop the full song" : "Play the full song"}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-(--signal) text-(--signal-ink)">
                {audioLoading ? (
                  <svg width="18" height="18" viewBox="0 0 20 20" className="animate-spin" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                    <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                ) : isPlaying ? (
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <rect x="4" y="3" width="4" height="14" rx="1" />
                    <rect x="12" y="3" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M5 3.5v13l11-6.5-11-6.5z" />
                  </svg>
                )}
              </span>
            </button>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
              {audioLoading ? "Loading full track" : "Play full track"}
            </p>
          </div>

          <div className="min-w-0 text-center sm:text-left">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: won ? "var(--success)" : "var(--miss)" }}>
              {won ? "Signal identified" : "Signal missed"}
            </p>
            <h2 id="result-title" className="mt-2 text-balance font-[family-name:var(--font-display)] text-3xl font-semibold leading-[0.95] tracking-[-0.02em] text-(--text)">
              {reveal.title}
            </h2>
            <p className="mt-2 text-sm leading-5 text-(--text-dim)">
              {[reveal.artist, reveal.album, reveal.releaseYear].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-4 text-sm text-(--text-dim)">
              {won
                ? `Recognised from ${formatDuration(revealMs)} of audio.`
                : `The full ${formatDuration(revealMs)} clue was unlocked.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 border-y border-(--hairline) bg-(--surface)">
          <div className="border-r border-(--hairline) px-3 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Points</p>
            <p className="mt-1 font-semibold text-(--text)">{won && points !== null ? `+${points}` : "—"}</p>
          </div>
          <div className="border-r border-(--hairline) px-3 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Score</p>
            <p className="mt-1 font-semibold text-(--text)">{score.toLocaleString()}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Streak</p>
            <p className="mt-1 font-semibold text-(--text)">{streak}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 sm:p-5">
          <button
            type="button"
            onClick={share}
            className="min-h-12 rounded-[7px] border border-(--hairline) bg-transparent px-3 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
          >
            {copied ? "Result copied" : "Share result"}
          </button>
          <button
            type="button"
            onClick={onNext}
            autoFocus
            className="min-h-12 rounded-[7px] bg-(--signal) px-3 text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
          >
            Next track
          </button>
        </div>
      </div>
    </div>
  );
}

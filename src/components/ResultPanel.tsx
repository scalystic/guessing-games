"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Song } from "@/data/songs";
import type { RoundStatus } from "@/hooks/useMelodleGame";
import { MAX_ATTEMPTS, REVEAL_LADDER_MS } from "@/hooks/useMelodleGame";
import { ToneEngine } from "@/lib/tone-engine";
import { usePreviewUrl } from "@/hooks/usePreviewUrl";
import { Confetti } from "./Confetti";

// Same ceiling PlayerBar uses for a fully-unlocked clip — the round is over,
// so there's no reveal ladder here, just "play the whole thing".
const FULL_DURATION_MS = REVEAL_LADDER_MS[REVEAL_LADDER_MS.length - 1];

type Props = {
  song: Song;
  status: RoundStatus;
  attemptsUsed: number;
  points: number | null;
  guesses: { correct: boolean; skipped: boolean }[];
  streak: number;
  score: number;
  accent: string;
  onNext: () => void;
};

// A full popup rather than an inline card swap — the round's outcome is the
// whole point of playing it, so it gets a proper moment on screen instead of
// quietly replacing the guess box. There's no backdrop-dismiss on purpose:
// "Next song" is the one deliberate way out, same as a Wordle-style
// end-of-round modal — closing it any other way would just leave an empty
// gap where the guess box used to be, since the round is still resolved.
export function ResultPanel({
  song,
  status,
  attemptsUsed,
  points,
  guesses,
  streak,
  score,
  accent,
  onNext,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const { previewUrl, status: previewStatus } = usePreviewUrl(song);
  const engineRef = useRef<ToneEngine | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const won = status === "SOLVED";

  useEffect(() => {
    engineRef.current = new ToneEngine();
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!previewUrl) {
      audioRef.current = null;
      return;
    }
    const audio = new Audio(previewUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    };
  }, []);

  function stopPlayback() {
    engineRef.current?.stop();
    audioRef.current?.pause();
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (previewStatus === "loading") return;
    engineRef.current?.stop();
    audioRef.current?.pause();
    setIsPlaying(true);

    const audio = audioRef.current;
    if (previewStatus === "ready" && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      stopTimeoutRef.current = setTimeout(() => {
        audio.pause();
        setIsPlaying(false);
      }, FULL_DURATION_MS);
    } else {
      const engine = engineRef.current;
      if (!engine) return;
      engine.onEnded = () => setIsPlaying(false);
      engine.play(song, FULL_DURATION_MS);
    }
  }

  function share() {
    const squares = guesses
      .map((g) => (g.correct ? "🟩" : g.skipped ? "⬛" : "🟥"))
      .join("");
    const text = `Sargam ${won ? attemptsUsed || 1 : "X"}/${MAX_ATTEMPTS}\n${squares}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-(--scrim) p-4 backdrop-blur-sm">
      <div
        className="panel-in relative w-full max-w-sm overflow-hidden rounded-3xl border p-6 shadow-2xl"
        style={{ borderColor: `${accent}40`, background: "var(--surface-strong)" }}
      >
        {won && <Confetti accent={accent} />}

        <div className="relative flex flex-col items-center text-center">
          <div className="relative">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, ${song.cover[0]}, ${song.cover[1]})` }}
            >
              {song.title[0]}
            </div>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={previewStatus === "loading"}
              aria-label={isPlaying ? "Stop song" : "Play full song"}
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/25 transition hover:bg-black/35"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-black shadow-md transition hover:scale-105 active:scale-95 ${isPlaying ? "pulse-ring" : ""}`}
                style={{
                  background: accent,
                  borderColor: "var(--surface-strong)",
                  "--pulse-color": `${accent}80`,
                } as CSSProperties}
              >
              {previewStatus === "loading" ? (
                <svg width="16" height="16" viewBox="0 0 20 20" className="animate-spin" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                  <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="4" y="3" width="4" height="14" rx="1" />
                  <rect x="12" y="3" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 3.5v13l11-6.5-11-6.5z" />
                </svg>
              )}
              </span>
            </button>
          </div>

          <p
            className="mt-4 text-sm font-bold uppercase tracking-wide"
            style={{ color: won ? "#6ba385" : "#c17a6b" }}
          >
            {won ? "🎉 Nailed it!" : "Not this time"}
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
            {song.title}
          </p>
          <p className="mt-1 text-sm text-(--text-dim)">
            {song.artist} · {song.album} · {song.year}
          </p>

          {won && points !== null && (
            <p className="mt-3 text-3xl font-extrabold text-(--text)">
              +{points}
              <span className="ml-1 text-sm font-medium text-(--text-faint)">points</span>
            </p>
          )}

          <p className="mt-3 text-xs text-(--text-faint)">
            Score <span className="font-semibold text-(--text-dim)">{score.toLocaleString()}</span>{" "}
            <span className="text-(--text-faint)">·</span> Streak{" "}
            <span className="font-semibold text-(--text-dim)">{streak}🔥</span>
          </p>
        </div>

        <div className="relative mt-5 flex gap-2">
          <button
            type="button"
            onClick={share}
            className="flex-1 rounded-xl border border-(--hairline) bg-(--surface) py-2.5 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
          >
            {copied ? "Copied!" : "Share result"}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-black transition hover:scale-[1.02] active:scale-95"
            style={{ background: accent }}
          >
            Next song →
          </button>
        </div>
      </div>
    </div>
  );
}

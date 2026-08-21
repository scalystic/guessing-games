"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RoundStatus } from "@/hooks/useMelodleGame";
import type { Reveal } from "@/lib/api/runs";
import { coverBackground } from "@/lib/cover";
import { Confetti } from "./Confetti";

type Props = {
  /// The answer, as returned by the server once the round resolved. The client
  /// never had it before this point.
  reveal: Reveal;
  status: RoundStatus;
  attemptsUsed: number;
  maxAttempts: number;
  points: number | null;
  guesses: { correct: boolean; skipped: boolean }[];
  streak: number;
  score: number;
  accent: string;
  /// Object URL for the WHOLE clip, not the prefix the round unlocked — this is
  /// the one place the player gets to hear all of it. Null while it loads, or if
  /// the fetch failed, in which case the cover tile is just a cover tile.
  fullAudioUrl: string | null;
  audioLoading: boolean;
  onNext: () => void;
};

// A full popup rather than an inline card swap — the round's outcome is the
// whole point of playing it, so it gets a proper moment on screen instead of
// quietly replacing the guess box. There's no backdrop-dismiss on purpose:
// "Next song" is the one deliberate way out, same as a Wordle-style
// end-of-round modal — closing it any other way would just leave an empty
// gap where the guess box used to be, since the round is still resolved.
export function ResultPanel({
  reveal,
  status,
  attemptsUsed,
  maxAttempts,
  points,
  guesses,
  streak,
  score,
  accent,
  fullAudioUrl,
  audioLoading,
  onNext,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const won = status === "SOLVED";

  // Same shape as PlayerBar: a fresh element per URL, so a previous round's
  // buffer can't still be decoding when this one starts.
  useEffect(() => {
    if (!fullAudioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(fullAudioUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    // No fade and no stop timer here, unlike PlayerBar — this is the complete
    // file, so it ends where the recording ends rather than being cut off
    // mid-note at a ladder boundary.
    const done = () => setIsPlaying(false);
    audio.addEventListener("ended", done);

    return () => {
      audio.removeEventListener("ended", done);
      audio.pause();
      audioRef.current = null;
      setIsPlaying(false);
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
      .map((g) => (g.correct ? "🟩" : g.skipped ? "⬛" : "🟥"))
      .join("");
    const text = `Sargam ${won ? attemptsUsed || 1 : "X"}/${maxAttempts}\n${squares}`;
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
              style={{ background: coverBackground(`${reveal.title} ${reveal.artist}`) }}
            >
              {reveal.title[0]}
            </div>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={audioLoading || !fullAudioUrl}
              aria-label={isPlaying ? "Stop the song" : "Play the whole song"}
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/25 transition hover:bg-black/35 disabled:hover:bg-black/25"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-black shadow-md transition hover:scale-105 active:scale-95 ${isPlaying ? "pulse-ring" : ""}`}
                style={
                  {
                    background: accent,
                    borderColor: "var(--surface-strong)",
                    "--pulse-color": `${accent}80`,
                  } as CSSProperties
                }
              >
                {audioLoading ? (
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
            {reveal.title}
          </p>
          {/* album and releaseYear are nullable in the catalog, so build this
              from whatever is actually there rather than printing "null". */}
          <p className="mt-1 text-sm text-(--text-dim)">
            {[reveal.artist, reveal.album, reveal.releaseYear].filter(Boolean).join(" · ")}
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

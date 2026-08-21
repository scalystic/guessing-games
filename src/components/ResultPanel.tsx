"use client";

import { useState } from "react";
import type { Song } from "@/data/songs";
import type { RoundStatus } from "@/hooks/useMelodleGame";
import { MAX_ATTEMPTS } from "@/hooks/useMelodleGame";
import { Confetti } from "./Confetti";

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
  const won = status === "SOLVED";

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
          <div
            className="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${song.cover[0]}, ${song.cover[1]})` }}
          >
            {song.title[0]}
          </div>

          <p
            className="mt-4 text-sm font-bold uppercase tracking-wide"
            style={{ color: won ? "#34d399" : "#f87171" }}
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

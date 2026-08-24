"use client";

import { useEffect, useRef, useState } from "react";
import type { RoundStatus, RoundHistoryEntry, AchievementEntry } from "@/hooks/useMelodleGame";
import type { Reveal } from "@/lib/api/runs";
import { fetchAlbumArtUrl } from "@/lib/album-art";

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
  roundsSolved: number;
  bestStreak: number;
  roundHistory: RoundHistoryEntry[];

  level: number;
  xpProgress: number;
  xpPerLevel: number;
  rankName: string;
  achievements: AchievementEntry[];
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
  roundsSolved,
  bestStreak,
  roundHistory,
  level,
  xpProgress,
  xpPerLevel,
  rankName,
  achievements,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const won = status === "SOLVED";

  // Safe to show the real cover here — the title/artist/album are already
  // revealed in plain text below, unlike the live PlayerBar deck.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAlbumArtUrl(reveal.title, reveal.artist, reveal.album).then((url) => {
      if (!cancelled) setCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [reveal.title, reveal.artist, reveal.album]);

  const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpPerLevel) * 100));

  const justUnlocked = {
    first_win: won && roundsSolved === 1,
    perfect_sync: won && attemptsUsed === 1,
    streak_master: won && streak === 10,
    century_score: won && score >= 1000 && (score - (points ?? 0)) < 1000,
  };

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
              className={`relative flex h-32 w-32 items-center justify-center rounded-full bg-cover bg-center text-[#151925] shadow-lg transition-opacity duration-200 disabled:cursor-wait disabled:opacity-65 ${
                coverUrl
                  ? ""
                  : "border-[10px] border-[#111520] bg-[repeating-radial-gradient(circle,#2e3444_0_2px,#121620_3px_6px)]"
              }`}
              style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
              aria-label={isPlaying ? "Stop the full song" : "Play the full song"}
            >
              {coverUrl && <span className="absolute inset-0 rounded-full bg-black/35" aria-hidden="true" />}
              <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-(--signal) text-(--signal-ink)">
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

          <div className="relative min-w-0 text-center sm:text-left">
            {/* Ambient Status Glow */}
            <div
              className="absolute -inset-10 -z-10 pointer-events-none opacity-20 blur-3xl rounded-full"
              style={{
                background: won
                  ? "radial-gradient(circle, var(--success) 0%, transparent 70%)"
                  : "radial-gradient(circle, var(--miss) 0%, transparent 70%)",
              }}
            />

            <div className="mb-3.5 flex justify-center sm:justify-start">
              <span
                className="inline-flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 font-mono text-[9px] font-extrabold uppercase tracking-[0.16em] shadow-xs backdrop-blur-md transition-all"
                style={{
                  backgroundColor: won
                    ? "color-mix(in srgb, var(--success) 12%, transparent)"
                    : "color-mix(in srgb, var(--miss) 12%, transparent)",
                  color: won ? "var(--success)" : "var(--miss)",
                  border: `1px solid ${
                    won
                      ? "color-mix(in srgb, var(--success) 30%, transparent)"
                      : "color-mix(in srgb, var(--miss) 30%, transparent)"
                  }`,
                }}
              >
                {/* Circular Icon Wrapper */}
                <span
                  className="flex h-4.5 w-4.5 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: won
                      ? "color-mix(in srgb, var(--success) 20%, transparent)"
                      : "color-mix(in srgb, var(--miss) 20%, transparent)",
                  }}
                >
                  {won ? (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2.5 6 4.5 8 9.5 3" />
                    </svg>
                  ) : (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
                      <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
                    </svg>
                  )}
                </span>
                {won ? "Correct Guess!" : "Tune Missed"}
              </span>
            </div>
            <h2 id="result-title" className="mt-2 text-balance font-[family-name:var(--font-display)] text-3xl font-semibold leading-[0.95] tracking-[-0.02em] text-(--text)">
              {reveal.title}
            </h2>
            <p className="mt-2 font-[family-name:var(--font-display)] text-xs leading-4 text-(--text-dim)">
              {[reveal.artist, reveal.album, reveal.releaseYear].filter(Boolean).join(" · ")}
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

        {/* Level Progress & Achievements */}
        <div className="border-b border-(--hairline) bg-(--surface-strong) p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Rank</span>
              <span className="text-xs font-bold text-(--signal)">{rankName}</span>
            </div>
            <span className="font-mono text-[10px] text-(--text-dim)">
              Lv. {level} • <strong className="font-semibold text-(--text)">{xpProgress}</strong> / {xpPerLevel} XP
            </span>
          </div>
          
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-(--surface) border border-(--hairline) mb-4">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-(--signal) to-orange-400 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(242,184,75,0.3)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {achievements.map((ach) => (
              <div
                key={ach.id}
                title={`${ach.name}: ${ach.desc}`}
                className={`relative flex flex-col items-center justify-center p-2 rounded-[8px] border text-center transition-all duration-300 ${
                  ach.unlocked
                    ? `bg-gradient-to-b ${ach.color}`
                    : "bg-transparent border-(--hairline) opacity-25 grayscale"
                }`}
              >
                {justUnlocked[ach.id as keyof typeof justUnlocked] && (
                  <span className="absolute -top-1.5 -right-1 px-1 py-0.5 font-mono text-[7px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 rounded-full animate-pulse z-10">
                    New!
                  </span>
                )}
                <span className="text-lg mb-0.5">{ach.icon}</span>
                <span className="text-[9px] font-extrabold tracking-tight truncate w-full uppercase font-mono">{ach.name}</span>
              </div>
            ))}
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

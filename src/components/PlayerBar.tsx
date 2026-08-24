"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { waveformBars } from "@/lib/cover";

type Props = {
  audioUrl: string | null;
  revealMs: number;
  totalMs: number;
  ladder: number[];
  loading: boolean;
  waveformSeed: string;
};

const BAR_COUNT = 32;
const FADE_OUT_MS = 15;

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  const value = seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? seconds : seconds.toFixed(1);
  return `${value} sec`;
}

export function PlayerBar({
  audioUrl,
  revealMs,
  totalMs,
  ladder,
  loading,
  waveformSeed,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);

  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  function stopPlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.volume = 1;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    rafRef.current = null;
    fadeTimeoutRef.current = null;
  }

  useEffect(() => stopPlayback, []);

  useEffect(() => {
    stopPlayback();
  }, [audioUrl]);

  const [lastUrl, setLastUrl] = useState(audioUrl);
  if (lastUrl !== audioUrl) {
    setLastUrl(audioUrl);
    if (isPlaying) setIsPlaying(false);
    if (progressMs !== 0) setProgressMs(0);
  }

  function tick() {
    const elapsed = performance.now() - playStartRef.current;
    if (elapsed >= revealMs) {
      setProgressMs(revealMs);
      setIsPlaying(false);
      return;
    }
    setProgressMs(elapsed);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    stopPlayback();
    playStartRef.current = performance.now();
    setIsPlaying(true);
    setProgressMs(0);
    rafRef.current = requestAnimationFrame(tick);

    audio.currentTime = 0;
    audio.volume = 1;
    void audio.play().catch(() => setIsPlaying(false));

    const fadeStart = Math.max(0, revealMs - FADE_OUT_MS);
    fadeTimeoutRef.current = setTimeout(() => {
      const steps = 5;
      for (let step = 1; step <= steps; step++) {
        setTimeout(() => {
          if (!audioRef.current) return;
          audioRef.current.volume = Math.max(0, 1 - step / steps);
        }, (FADE_OUT_MS / steps) * step);
      }
    }, fadeStart);
  }

  function handleStop() {
    stopPlayback();
    setIsPlaying(false);
  }

  const playedPct = totalMs > 0 ? Math.min(100, (progressMs / totalMs) * 100) : 0;
  const bars = useMemo(() => waveformBars(waveformSeed, BAR_COUNT), [waveformSeed]);
  const disabled = loading || !audioUrl;

  return (
    <section className="signal-deck rounded-[18px] p-4 text-[#f2e9d8] sm:p-6" aria-label="Mystery audio deck">
      <div className="flex items-start justify-between gap-4 border-b border-[#343b51] pb-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8e93a3]">
            Clip window
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-semibold leading-none tracking-[-0.02em] text-[#f2e9d8] sm:text-5xl">
            {formatDuration(revealMs)}
          </p>
        </div>
        <div className="border border-[#394056] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a8adba]">
          {loading ? "Tuning" : isPlaying ? "On air" : "Ready"}
        </div>
      </div>

      <div className="cassette-window mt-5 grid grid-cols-[42px_1fr_42px] items-center gap-3 rounded-[10px] px-3 py-5 sm:grid-cols-[56px_1fr_56px] sm:gap-5 sm:px-5">
        <span className="cassette-reel aspect-square rounded-full" data-playing={isPlaying} aria-hidden="true" />

        <div className="flex h-14 items-center gap-0.5 overflow-hidden" aria-hidden="true">
          {bars.map((height, index) => {
            const barPct = (index / BAR_COUNT) * 100;
            return (
              <span
                key={index}
                className="min-h-1 flex-1 bg-[#42495d] transition-colors duration-150"
                style={{
                  height: `${height.toFixed(2)}%`,
                  background: barPct <= playedPct ? "var(--signal)" : undefined,
                }}
              />
            );
          })}
        </div>

        <span className="cassette-reel aspect-square rounded-full" data-playing={isPlaying} aria-hidden="true" />
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={isPlaying ? handleStop : handlePlay}
          disabled={disabled}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-(--signal) text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={isPlaying ? "Stop the clip" : `Play the ${formatDuration(revealMs)} clip`}
        >
          {loading ? (
            <svg width="20" height="20" viewBox="0 0 20 20" className="animate-spin" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
              <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <rect x="4" y="3" width="4" height="14" rx="1" />
              <rect x="12" y="3" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M5 3.5v13l11-6.5-11-6.5z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#f2e9d8]">
            {loading ? "Tuning the next signal…" : isPlaying ? "Listen closely" : "Think you know it?"}
          </p>
          <p className="mt-1 text-xs text-[#8e93a3]">
            Replay as often as you need. A miss unlocks more.
          </p>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-6 gap-1.5" aria-label="Reveal stages">
        {ladder.map((milliseconds) => {
          const current = milliseconds === revealMs;
          const unlocked = milliseconds <= revealMs;
          return (
            <li
              key={milliseconds}
              className="border-t-2 pt-2 text-center font-mono text-[9px] sm:text-[10px]"
              style={{
                borderColor: current ? "var(--signal)" : unlocked ? "#777e91" : "#303648",
                color: current ? "var(--signal)" : unlocked ? "#c6c0b4" : "#9da3b6",
              }}
              aria-current={current ? "step" : undefined}
            >
              {formatDuration(milliseconds).replace(" sec", "s")}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

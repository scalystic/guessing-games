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
  /// When set, the play button calls this instead of playing a clip, and is
  /// never disabled for lack of one — the pre-round state, before an era has
  /// been picked and there's anything loaded to play.
  onPlayRequested?: () => void;
  promptTitle?: string;
  promptSubtitle?: string;
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
  onPlayRequested,
  promptTitle,
  promptSubtitle,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const [vuLevels, setVuLevels] = useState([0, 0]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = setInterval(() => {
      setVuLevels([
        Math.floor(Math.random() * 8) + 1,
        Math.floor(Math.random() * 8) + 1,
      ]);
    }, 100);

    return () => {
      clearInterval(interval);
      setVuLevels([0, 0]);
    };
  }, [isPlaying]);

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
  const disabled = onPlayRequested ? loading : loading || !audioUrl;

  return (
    <section className="signal-deck rounded-[18px] p-4 text-[#f2e9d8] sm:p-6" aria-label="Mystery audio deck">
      <div className="flex items-start justify-between gap-4 border-b border-[#343b51] pb-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8e93a3]">
            Clip window
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-none tracking-[-0.02em] text-[#f2e9d8] sm:text-3xl">
            {formatDuration(revealMs)}
          </p>
        </div>
        <div className="border border-[#394056] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a8adba] flex items-center gap-1.5 rounded-[4px]">
          {isPlaying && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff4d4d] animate-pulse shadow-[0_0_6px_#ff4d4d]" />
          )}
          {!isPlaying && !loading && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#525a70]" />
          )}
          {loading && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#f2b84b] animate-ping" />
          )}
          <span>{loading ? "Tuning" : isPlaying ? "On air" : "Ready"}</span>
        </div>
      </div>

      <div className="relative mt-5 p-4 rounded-[12px] bg-[#10131e] border border-[#2d3447] shadow-inner overflow-hidden">
        {/* Cassette Shell Label body */}
        <div className="absolute inset-2 bg-gradient-to-b from-[#2c3347] to-[#1a1e2b] rounded-[8px] border border-[#3e4761] shadow-md z-0 opacity-90" />
        
        {/* Cassette Label Stripe (Cream/Gold/Blue horizontal stripes) */}
        <div className="absolute top-1/2 -translate-y-1/2 left-2 right-2 h-10 bg-gradient-to-r from-[#d99d2f]/10 via-[#3a7ad5]/15 to-[#d99d2f]/10 border-t border-b border-[#3e4761]/30 z-0 pointer-events-none" />

        {/* Clear center viewport window */}
        <div className="relative z-10 grid grid-cols-[42px_1fr_42px] items-center gap-3 rounded-[6px] bg-[#07090f] border border-[#1b1f2d] shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] px-3 py-4 sm:grid-cols-[56px_1fr_56px] sm:gap-5 sm:px-5 overflow-hidden">
          {/* Glass reflection overlay */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-transparent via-white/[0.015] to-white/[0.05] z-20" />

          {/* 4 Corner Screws */}
          <div className="absolute top-1 left-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />
          <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />
          <div className="absolute bottom-1 left-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />
          <div className="absolute bottom-1 right-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />

          {/* Cassette Tape Film background line */}
          <div className="absolute bottom-1.5 left-6 right-6 h-[4px] bg-[#22170d] border-t border-[#3d2c1c] opacity-90 z-0" />

          {/* Cassette Label Text */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 font-mono text-[7px] tracking-[0.25em] text-[#5b647d] uppercase select-none pointer-events-none z-10">
            SARGAM CH-1 • C90
          </div>

          <span className="cassette-reel relative aspect-square rounded-full z-10" data-playing={isPlaying} aria-hidden="true" />

          <div className="relative flex h-10 items-center gap-0.5 overflow-hidden z-10" aria-hidden="true">
            {bars.map((height, index) => {
              const barPct = (index / BAR_COUNT) * 100;
              return (
                <span
                  key={index}
                  className="min-h-1 flex-1 bg-[#1e2333] transition-colors duration-150"
                  style={{
                    height: `${height.toFixed(2)}%`,
                    background: barPct <= playedPct ? "var(--signal)" : undefined,
                  }}
                />
              );
            })}
          </div>

          <span className="cassette-reel relative aspect-square rounded-full z-10" data-playing={isPlaying} aria-hidden="true" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 border-t border-[#2d3447] pt-5">
        <button
          type="button"
          onClick={onPlayRequested ?? (isPlaying ? handleStop : handlePlay)}
          disabled={disabled}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-(--signal) text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={onPlayRequested ? "Choose an era to start" : isPlaying ? "Stop the clip" : `Play the ${formatDuration(revealMs)} clip`}
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
            {loading
              ? "Tuning the next signal…"
              : isPlaying
                ? "Listen closely"
                : (promptTitle ?? "Think you know it?")}
          </p>
          <p className="mt-1 text-xs text-[#8e93a3]">
            {promptSubtitle ?? "Replay as often as you need. A miss unlocks more."}
          </p>
        </div>

        {/* Dual LED VU Meter on the right */}
        <div className="flex flex-col gap-1 bg-[#0b0d14] p-2 rounded border border-[#242a3a] shadow-inner shrink-0 w-[110px]">
          <div className="flex items-center justify-between text-[6px] font-mono text-[#525a70] px-1 mb-0.5">
            <span>LEVEL METER</span>
            <span>VU</span>
          </div>
          {/* L channel */}
          <div className="flex items-center gap-[2px]">
            <span className="text-[7px] font-mono text-[#525a70] w-2.5">L</span>
            {Array.from({ length: 8 }).map((_, i) => {
              const active = vuLevels[0] > i;
              let color = "bg-[#181c26]";
              if (active) {
                if (i < 5) color = "bg-[#22c55e] shadow-[0_0_4px_rgba(34,197,94,0.6)]";
                else if (i < 7) color = "bg-[#eab308] shadow-[0_0_4px_rgba(234,179,8,0.6)]";
                else color = "bg-[#ef4444] shadow-[0_0_4px_rgba(239,68,68,0.6)]";
              }
              return <span key={i} className={`h-1 w-[7px] rounded-[1px] transition-all duration-75 ${color}`} />;
            })}
          </div>
          {/* R channel */}
          <div className="flex items-center gap-[2px]">
            <span className="text-[7px] font-mono text-[#525a70] w-2.5">R</span>
            {Array.from({ length: 8 }).map((_, i) => {
              const active = vuLevels[1] > i;
              let color = "bg-[#181c26]";
              if (active) {
                if (i < 5) color = "bg-[#22c55e] shadow-[0_0_4px_rgba(34,197,94,0.6)]";
                else if (i < 7) color = "bg-[#eab308] shadow-[0_0_4px_rgba(234,179,8,0.6)]";
                else color = "bg-[#ef4444] shadow-[0_0_4px_rgba(239,68,68,0.6)]";
              }
              return <span key={i} className={`h-1 w-[7px] rounded-[1px] transition-all duration-75 ${color}`} />;
            })}
          </div>
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
                borderColor: unlocked ? "var(--signal)" : "#303648",
                color: unlocked ? "var(--signal)" : "#9da3b6",
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

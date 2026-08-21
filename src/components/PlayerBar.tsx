"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { waveformBars } from "@/lib/cover";

/// Plays the bytes the current round has earned — nothing more.
///
/// There is no scrub handle and no seek, and that is a server-side property
/// rather than a UI restraint: the response only ever CONTAINS the unlocked
/// prefix (see /api/runs/[runId]/audio), so there is no later audio in the
/// buffer to scrub into.

type Props = {
  /// Object URL for the stage's audio. Null while loading or on failure.
  audioUrl: string | null;
  /// Milliseconds of audio this stage unlocked, from the game's reveal ladder.
  revealMs: number;
  /// The full ladder window — the bar is always drawn to this scale so the
  /// unlocked portion visibly grows as stages are earned.
  totalMs: number;
  ladder: number[];
  accent: string;
  loading: boolean;
  /// Seed for the decorative waveform. Changing it redraws the shape, so pass
  /// something stable for the round.
  waveformSeed: string;
};

const BAR_COUNT = 44;

/// The clip ends abruptly by construction — stages 1-5 are byte prefixes, so
/// there is no fade baked into the file (see scripts/ingest.ts). Ramping the
/// gain down over the last few milliseconds is the client's job.
const FADE_OUT_MS = 15;

function formatMs(ms: number) {
  const seconds = ms / 1000;
  const shown = seconds < 10 ? seconds.toFixed(seconds % 1 === 0 ? 0 : 1) : seconds.toFixed(0);
  return `0:${seconds < 10 ? "0" : ""}${shown}`;
}

export function PlayerBar({
  audioUrl,
  revealMs,
  totalMs,
  ladder,
  accent,
  loading,
  waveformSeed,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);

  // A fresh element per URL. Reusing one and reassigning src leaves the old
  // buffer decoding, which shows up as the previous stage playing for a beat.
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

  // New stage or new round — drop anything mid-flight. Talking to the audio
  // element is a genuine external-system effect; the mirrored UI state resets
  // during render below instead of piggybacking a setState onto this.
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

    // Linear ramp over the tail. Stepping volume down in a few frames avoids
    // the click that a hard stop produces, without needing an AudioContext and
    // a GainNode for a clip this short.
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
  const unlockedPct = totalMs > 0 ? Math.min(100, (revealMs / totalMs) * 100) : 0;

  const bars = useMemo(() => waveformBars(waveformSeed, BAR_COUNT), [waveformSeed]);

  // Ladder marks, excluding the final stage — that one is the end of the bar.
  const ticks = useMemo(
    () => (totalMs > 0 ? ladder.slice(0, -1).map((ms) => (ms / totalMs) * 100) : []),
    [ladder, totalMs],
  );

  const disabled = loading || !audioUrl;

  return (
    <div className="w-full">
      <div
        className="flex items-center gap-3 rounded-full border bg-(--surface) py-2 pr-5 pl-2"
        style={{ borderColor: `${accent}40` }}
      >
        <button
          type="button"
          onClick={isPlaying ? handleStop : handlePlay}
          disabled={disabled}
          className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-full text-black shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-50 ${isPlaying ? "pulse-ring" : ""}`}
          style={
            {
              background: accent,
              boxShadow: isPlaying ? undefined : `0 6px 18px -6px ${accent}`,
              "--pulse-color": `${accent}80`,
            } as CSSProperties
          }
          aria-label={isPlaying ? "Stop" : "Play the unlocked clip"}
        >
          {loading ? (
            <svg width="18" height="18" viewBox="0 0 20 20" className="animate-spin" fill="none">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
              <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <rect x="4" y="3" width="4" height="14" rx="1" />
              <rect x="12" y="3" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 3.5v13l11-6.5-11-6.5z" />
            </svg>
          )}
        </button>

        <div className="flex h-10 flex-1 items-center gap-0.5">
          {bars.map((height, i) => {
            const barPct = (i / BAR_COUNT) * 100;
            const lit = barPct <= playedPct;
            const withinUnlocked = barPct <= unlockedPct;
            return (
              <span
                key={i}
                className="min-h-[10%] flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${height.toFixed(2)}%`,
                  background: lit
                    ? accent
                    : withinUnlocked
                      ? "var(--text-faint)"
                      : "var(--hairline)",
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="relative h-2 w-full rounded-full bg-(--surface)">
          {/* How much of the ladder this stage has unlocked. */}
          <div
            className="absolute inset-y-0 left-0 rounded-full opacity-25"
            style={{ width: `${unlockedPct}%`, background: accent }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
            style={{ width: `${playedPct}%`, background: accent }}
          />
          {/* Visual only. There is nothing to seek to — the response contains
              only the unlocked prefix. */}
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 shadow transition-all duration-100"
            style={{
              left: `${playedPct}%`,
              marginLeft: "-7px",
              background: accent,
              borderColor: "var(--surface-strong)",
            }}
          />
          {ticks.map((tick, i) => (
            <span
              key={i}
              className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded bg-(--bg)"
              style={{ left: `${tick}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-(--text-faint)">
          <span>{formatMs(Math.min(progressMs, revealMs))}</span>
          <span>unlocked {formatMs(revealMs)}</span>
        </div>
      </div>
    </div>
  );
}

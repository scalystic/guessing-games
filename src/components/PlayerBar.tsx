"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ToneEngine, getRiff } from "@/lib/tone-engine";
import { REVEAL_LADDER_MS } from "@/hooks/useMelodleGame";
import { usePreviewUrl } from "@/hooks/usePreviewUrl";
import type { Song } from "@/data/songs";

type Props = {
  song: Song;
  revealMs: number;
  accent: string;
  locked: boolean; // true once round resolved — full track can play
};

const TOTAL_MS = REVEAL_LADDER_MS[REVEAL_LADDER_MS.length - 1];

function formatMs(ms: number) {
  const s = ms / 1000;
  return `0:${s < 10 ? "0" : ""}${s % 1 === 0 ? s : s.toFixed(1)}`;
}

export function PlayerBar({ song, revealMs, accent, locked }: Props) {
  const { previewUrl, status } = usePreviewUrl(song);
  const engineRef = useRef<ToneEngine | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef(0);

  const playDuration = locked ? TOTAL_MS : revealMs;

  useEffect(() => {
    engineRef.current = new ToneEngine();
    return () => engineRef.current?.dispose();
  }, []);

  // Real preview clip, once the lookup resolves. A plain <audio> element
  // needs no CORS handling for playback (only for reading its samples,
  // which we don't do), so this just works once we have a URL.
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

  function stopAll() {
    engineRef.current?.stop();
    audioRef.current?.pause();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
  }

  // New round or newly unlocked reveal window — stop anything mid-flight.
  // Talking to audio/AudioContext is a real external-system effect;
  // resetting the mirrored UI state happens during render (see
  // lastResetKey below) instead of piggybacking a setState onto this one.
  useEffect(() => {
    stopAll();
  }, [song.id, revealMs, locked]);

  const resetKey = `${song.id}:${revealMs}:${locked}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    if (isPlaying) setIsPlaying(false);
    if (progressMs !== 0) setProgressMs(0);
  }

  function tick() {
    const elapsed = performance.now() - playStartRef.current;
    if (elapsed >= playDuration) {
      setProgressMs(playDuration);
      setIsPlaying(false);
      return;
    }
    setProgressMs(elapsed);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePlay() {
    if (status === "loading") return;
    stopAll();
    playStartRef.current = performance.now();
    setIsPlaying(true);
    setProgressMs(0);
    rafRef.current = requestAnimationFrame(tick);

    const audio = audioRef.current;
    if (status === "ready" && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      stopTimeoutRef.current = setTimeout(() => audio.pause(), playDuration);
    } else {
      const engine = engineRef.current;
      if (!engine) return;
      engine.onEnded = () => setIsPlaying(false);
      engine.play(song, playDuration);
    }
  }

  function handleStop() {
    stopAll();
    setIsPlaying(false);
  }

  const pct = Math.min(100, (progressMs / TOTAL_MS) * 100);
  const unlockedPct = Math.min(100, (playDuration / TOTAL_MS) * 100);

  const ticks = useMemo(
    () => REVEAL_LADDER_MS.slice(0, -1).map((ms) => (ms / TOTAL_MS) * 100),
    [],
  );

  // One bar per synthesized note — a decorative waveform shape (the song's
  // actual audio may now be the real preview clip, but analyzing that in
  // real time is a lot of extra plumbing for what's still a placeholder
  // catalog). Deterministic per song either way.
  const bars = useMemo(() => {
    const riff = getRiff(song);
    const freqs = riff.map((n) => n.freq);
    const min = Math.min(...freqs);
    const max = Math.max(...freqs);
    const span = max - min || 1;
    return riff.map((note) => ({
      startMs: note.startMs,
      heightPct: 28 + 68 * ((note.freq - min) / span),
    }));
  }, [song]);

  return (
    <div className="w-full">
      {/* One fused capsule — voice-note style — instead of a round button
          bolted onto a separate rectangular waveform box. */}
      <div
        className="flex items-center gap-3 rounded-full border bg-(--surface) py-2 pr-5 pl-2"
        style={{ borderColor: `${accent}40` }}
      >
        <button
          type="button"
          onClick={isPlaying ? handleStop : handlePlay}
          disabled={status === "loading"}
          className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-full text-black shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-50 ${isPlaying ? "pulse-ring" : ""}`}
          style={{
            background: accent,
            boxShadow: isPlaying ? undefined : `0 6px 18px -6px ${accent}`,
            "--pulse-color": `${accent}80`,
          } as CSSProperties}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {status === "loading" ? (
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
          {/* Static amplitude shape, like a phone voice-message waveform —
              the bars don't move; only the played/unplayed color sweeps
              across them as progress advances. */}
          {bars.map((bar, i) => {
            const barPct = (bar.startMs / TOTAL_MS) * 100;
            const lit = barPct <= pct;
            const withinUnlocked = barPct <= unlockedPct;
            return (
              <span
                key={i}
                className="min-h-[10%] flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${bar.heightPct.toFixed(2)}%`,
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
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
            style={{ width: `${pct}%`, background: accent }}
          />
          {/* Visual only — not draggable. Letting players scrub ahead would
              let them hear more of the clip than they've actually unlocked. */}
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 shadow transition-all duration-100"
            style={{ left: `${pct}%`, marginLeft: "-7px", background: accent, borderColor: "var(--surface-strong)" }}
          />
          {!locked &&
            ticks.map((t, i) => (
              <span
                key={i}
                className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded bg-(--bg)"
                style={{ left: `${t}%` }}
              />
            ))}
        </div>
        <div className="flex justify-between text-[11px] text-(--text-faint)">
          <span>{formatMs(Math.min(progressMs, playDuration))}</span>
          <span>{locked ? formatMs(TOTAL_MS) : `unlocked ${formatMs(revealMs)}`}</span>
        </div>
        <p className="text-[10px] text-(--text-faint)">
          {status === "loading" && "Looking up a preview clip…"}
          {status === "ready" && "Playing a real preview clip."}
          {status === "unavailable" && "No preview found — playing a placeholder tone."}
        </p>
      </div>
    </div>
  );
}

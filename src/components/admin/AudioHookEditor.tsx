"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WaveCanvas, type WaveCanvasHandle, type ScrubIntent } from "./WaveCanvas";
import {
  analyseChannel,
  formatHookTime,
  nearestZeroCrossing,
  stepOnset,
  type WaveAnalysis,
} from "./hook-audio";

/**
 * Audio-only, millisecond-accurate editor for Song.hookStartMs.
 *
 * The number this places decides what the first 400ms of a round sounds like,
 * for every player who ever draws the song. So the editor is built to make that
 * number verifiable rather than guessable: you see the waveform, you hear the
 * exact slice a player hears, and you move the boundary a millisecond at a time.
 *
 * ---------------------------------------------------------------------------
 * Why this decodes its own audio instead of embedding the YouTube player
 * ---------------------------------------------------------------------------
 *
 * Players stream from YouTube, and it would be natural to review through the
 * same iframe. It cannot do this job. `seekTo()` lands within roughly 50-250ms
 * of the request because it resolves to a media fragment, not a sample;
 * `getCurrentTime()` is quantised to about a frame; and a cross-origin iframe
 * exposes no audio data at all, so there is no waveform to look at. An editor on
 * top of that would display milliseconds it has no ability to hit.
 *
 * Instead the server extracts the track once (lib/admin/source-audio.ts) and
 * this decodes it into an AudioBuffer. `AudioBufferSourceNode.start(when,
 * offset)` takes its offset as a double in seconds, so playback begins on the
 * sample asked for, every time, with no seek latency to wait through.
 *
 * The one thing to hold in mind: what plays here is the true audio, whereas a
 * player hears YouTube's transcode of it starting from a seek that is itself
 * only frame-accurate. Placing the hook a beat INSIDE the sound rather than
 * exactly on its leading edge absorbs that, which is what the zero-crossing and
 * onset controls are for.
 *
 * ---------------------------------------------------------------------------
 * No fades
 * ---------------------------------------------------------------------------
 *
 * Deliberately absent. A 2ms ramp on the preview would hide precisely the click
 * that tells you the hook has landed mid-cycle — and that click is a real defect
 * a player would hear, not a preview artifact. Better to hear it and press
 * "Zero X" than to have the editor smooth it away.
 */

type Props = {
  puzzleId: string;
  /// YouTube id. Null means there is nothing to decode; the editor renders a
  /// dead state rather than being conditionally mounted, so the drawer layout
  /// doesn't jump.
  videoId: string | null;
  hookStartMs: number;
  /// Takes an updater as well as a value, and the nudge buttons rely on it.
  /// React batches clicks that land in the same tick, so a handler computing
  /// `hookStartMs + delta` from the rendered prop collapses a fast run of "+1"
  /// clicks into a single one — the exact interaction this editor exists for.
  /// Everything that steps RELATIVE to the current hook must go through the
  /// function form.
  onHookStartMsChange: (next: number | ((previousMs: number) => number)) => void;
  /// Locked songs can be auditioned but not edited. Enforced again by
  /// PATCH /api/admin/songs/[puzzleId]; this is the UI half.
  readOnly: boolean;
  /// Game.revealLadder in ms, cumulative. Drives the stage previews and the
  /// rung ticks over the waveform.
  ladder: number[];
};

type LoadState =
  | { status: "idle" }
  | { status: "probing" }
  /// Waiting on a job that is pulling the track from YouTube and transcoding it.
  /// Held separately from "downloading" because one is tens of seconds and the
  /// other is one, and a single spinner for both reads as a hang.
  | { status: "extracting"; waitedMs: number }
  | { status: "downloading" }
  | { status: "decoding" }
  | { status: "ready" }
  | { status: "error"; message: string; canRetry: boolean };

/// How often to ask whether extraction has finished. Two seconds is short enough
/// that a warm cache still feels immediate and long enough that a two-minute
/// extraction is sixty requests rather than six hundred.
const POLL_INTERVAL_MS = 2000;

/// Give up waiting after this. The server's own extraction timeout is 240s;
/// this sits past it so the job's real error message wins the race and the
/// client's generic one is only ever seen when the job vanished entirely.
const POLL_TIMEOUT_MS = 300_000;

/// Widths of the zoomed view, in milliseconds across the whole canvas. The last
/// one is about a thousandth of a second per pixel — past the point where
/// further zoom shows anything the millisecond readout doesn't.
const ZOOM_LEVELS_MS = [8000, 2000, 500, 120, 40];
const DEFAULT_ZOOM_INDEX = 2;

/// Lead-in for the "run-in" preview. Long enough to hear the approach into the
/// hook and judge whether it enters in the right place.
const RUN_IN_MS = 2500;

/// How far the zero-crossing snap will travel, in ms. Beyond this it has found
/// something other than the current cycle and would move the hook somewhere
/// musically different.
const ZERO_CROSS_MAX_MS = 12;

const NUDGES = [-1000, -100, -10, -1, 1, 10, 100, 1000];

/// Carries whether the failure is worth another attempt, which the loader knows
/// and the catch block otherwise wouldn't. A plain Error would collapse
/// "YouTube refused this video" and "this deployment has no way to extract
/// audio" into the same retry button.
class AudioLoadError extends Error {
  constructor(
    message: string,
    readonly canRetry: boolean,
  ) {
    super(message);
    this.name = "AudioLoadError";
  }
}

export function AudioHookEditor({
  puzzleId,
  videoId,
  hookStartMs,
  onHookStartMsChange,
  readOnly,
  ladder,
}: Props) {
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [analysis, setAnalysis] = useState<WaveAnalysis | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [zoomCenterMs, setZoomCenterMs] = useState(hookStartMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopStage, setLoopStage] = useState(false);
  const [hookDraft, setHookDraft] = useState<string | null>(null);
  /// Bumped to re-run the loader. `force` re-extracts server-side rather than
  /// reusing the cached file — the retry that fixes a truncated extraction,
  /// which a plain retry would just re-serve.
  const [reload, setReload] = useState({ token: 0, force: false });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const overviewRef = useRef<WaveCanvasHandle | null>(null);
  const zoomRef = useRef<WaveCanvasHandle | null>(null);
  /// What the animation loop needs each frame. A ref, so starting playback
  /// doesn't have to re-create the loop closure.
  const playbackRef = useRef<{
    startedAtCtxTime: number;
    fromSec: number;
    toSec: number;
    loop: boolean;
  } | null>(null);

  const channel = useMemo(() => (buffer ? buffer.getChannelData(0) : null), [buffer]);
  const sampleRate = buffer?.sampleRate ?? 48_000;
  const durationMs = buffer ? buffer.duration * 1000 : 0;

  const msToSample = useCallback((ms: number) => (ms / 1000) * sampleRate, [sampleRate]);
  const sampleToMs = useCallback((sample: number) => (sample / sampleRate) * 1000, [sampleRate]);

  // --------------------------------------------------------------------------
  // Load + decode
  // --------------------------------------------------------------------------

  useEffect(() => {
    // No video id means the component renders its dead state and never loads.
    // Returning rather than resetting `load`: the state is already "idle" and
    // writing it here would be a setState in an effect body for no change.
    if (!videoId) return;

    let cancelled = false;
    const controller = new AbortController();

    async function run(force: boolean) {
      setBuffer(null);
      setAnalysis(null);

      const base = `/api/admin/songs/${puzzleId}/source-audio`;

      /// One status read. Shape is shared by the probe and the start call, so
      /// both funnel through here.
      async function readStatus(path: string, init?: RequestInit) {
        const response = await fetch(path, { ...init, signal: controller.signal });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new AudioLoadError(
            json?.error?.message ?? `Audio request failed (${response.status}).`,
            // A deployment with no toolchain and no audio service won't be
            // fixed by pressing the button again; a failed YouTube fetch
            // sometimes will.
            json?.error?.code !== "audio_toolchain_missing",
          );
        }
        return json?.data as
          | { state: "ready"; byteSize: number }
          | { state: "extracting" | "absent" }
          | { state: "error"; kind: string; message: string };
      }

      try {
        setLoad({ status: "probing" });
        let status = await readStatus(`${base}?probe=1`);
        if (cancelled) return;

        // Kick off a job if nothing has the audio yet. Idempotent server-side,
        // so racing another admin on the same song just joins their extraction.
        if (force || status.state === "absent" || status.state === "error") {
          status = await readStatus(`${base}${force ? "?force=1" : ""}`, { method: "POST" });
          if (cancelled) return;
        }

        // Poll until the job lands. The wait is surfaced as a running count
        // rather than a bare spinner — a cold pull genuinely takes a minute, and
        // a number that keeps moving is the difference between "slow" and
        // "broken".
        const startedAt = Date.now();
        while (status.state === "extracting") {
          const waitedMs = Date.now() - startedAt;
          if (waitedMs > POLL_TIMEOUT_MS) {
            throw new AudioLoadError(
              "Extraction is still running after five minutes. Something is wrong upstream — try again, or re-extract.",
              true,
            );
          }
          setLoad({ status: "extracting", waitedMs });
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          if (cancelled) return;
          status = await readStatus(`${base}?probe=1`);
          if (cancelled) return;
        }

        if (status.state === "error") {
          throw new AudioLoadError(status.message, status.kind !== "toolchain");
        }
        if (status.state !== "ready") {
          throw new AudioLoadError("The audio service didn't produce a file.", true);
        }

        setLoad({ status: "downloading" });
        const response = await fetch(base, { signal: controller.signal });
        if (cancelled) return;

        if (!response.ok) {
          const json = await response.json().catch(() => null);
          throw new AudioLoadError(
            json?.error?.message ?? `Audio request failed (${response.status}).`,
            true,
          );
        }

        const bytes = await response.arrayBuffer();
        if (cancelled) return;

        setLoad({ status: "decoding" });
        const ctx = ensureContext();
        // decodeAudioData resamples to the context's rate, so every sample index
        // in this component is in CONTEXT samples, not file samples. That is why
        // nothing here reads the 32kHz the server encoded at.
        const decoded = await ctx.decodeAudioData(bytes);
        if (cancelled) return;

        setBuffer(decoded);
        setAnalysis(analyseChannel(decoded.getChannelData(0), decoded.sampleRate));
        setLoad({ status: "ready" });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setLoad({
          status: "error",
          message:
            error instanceof Error ? error.message : "Couldn't decode the audio for this song.",
          canRetry: error instanceof AudioLoadError ? error.canRetry : true,
        });
      }
    }

    void run(reload.force);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [puzzleId, videoId, reload]);

  function ensureContext(): AudioContext {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  }

  // Tear down on unmount. Without closing the context, opening the drawer on
  // twenty songs in a review session leaves twenty live audio graphs behind and
  // browsers cap how many a page may hold.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

  // --------------------------------------------------------------------------
  // Playback
  // --------------------------------------------------------------------------

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const source = sourceRef.current;
    sourceRef.current = null;
    playbackRef.current = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* never started, or already ended */
      }
    }
    setIsPlaying(false);
    overviewRef.current?.drawPlayhead(null);
    zoomRef.current?.drawPlayhead(null);
  }, []);

  const tick = useCallback(() => {
    const playback = playbackRef.current;
    const ctx = audioCtxRef.current;
    if (!playback || !ctx) return;

    const elapsed = ctx.currentTime - playback.startedAtCtxTime;
    let positionSec = playback.fromSec + elapsed;

    if (playback.loop) {
      const span = playback.toSec - playback.fromSec;
      if (span > 0 && positionSec > playback.toSec) {
        positionSec = playback.fromSec + ((positionSec - playback.fromSec) % span);
      }
    }

    const sample = positionSec * sampleRate;
    overviewRef.current?.drawPlayhead(sample);
    zoomRef.current?.drawPlayhead(sample);
    rafRef.current = requestAnimationFrame(tick);
  }, [sampleRate]);

  const playRange = useCallback(
    (fromMs: number, toMs: number, loop = false) => {
      if (!buffer) return;
      stop();

      const ctx = ensureContext();
      // Autoplay policy: the context starts suspended until a gesture. Every
      // path into here is a click or a keypress, so resuming is always allowed.
      void ctx.resume();

      const fromSec = Math.max(0, Math.min(buffer.duration, fromMs / 1000));
      const toSec = Math.max(fromSec, Math.min(buffer.duration, toMs / 1000));
      if (toSec <= fromSec) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      if (loop) {
        source.loop = true;
        source.loopStart = fromSec;
        source.loopEnd = toSec;
        source.start(0, fromSec);
      } else {
        source.start(0, fromSec, toSec - fromSec);
        source.onended = () => {
          if (sourceRef.current === source) stop();
        };
      }

      sourceRef.current = source;
      playbackRef.current = {
        startedAtCtxTime: ctx.currentTime,
        fromSec,
        toSec,
        loop,
      };
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [buffer, stop, tick],
  );

  const stageMs = ladder.length > 0 ? ladder[0]! : 400;
  const fullWindowMs = ladder.length > 0 ? ladder[ladder.length - 1]! : 15_000;

  const playStage = useCallback(() => {
    playRange(hookStartMs, hookStartMs + stageMs, loopStage);
  }, [hookStartMs, loopStage, playRange, stageMs]);

  const playFullWindow = useCallback(() => {
    playRange(hookStartMs, hookStartMs + fullWindowMs, false);
  }, [fullWindowMs, hookStartMs, playRange]);

  const playRunIn = useCallback(() => {
    playRange(Math.max(0, hookStartMs - RUN_IN_MS), hookStartMs + stageMs, false);
  }, [hookStartMs, playRange, stageMs]);

  // --------------------------------------------------------------------------
  // Hook manipulation
  // --------------------------------------------------------------------------

  const clampMs = useCallback(
    (ms: number) => Math.max(0, Math.min(Math.round(durationMs || Infinity), Math.round(ms))),
    [durationMs],
  );

  /// Absolute placement — a canvas click, the ms input, a jump to a fixed point.
  const setHook = useCallback(
    (ms: number) => {
      if (readOnly) return;
      onHookStartMsChange(clampMs(ms));
    },
    [clampMs, onHookStartMsChange, readOnly],
  );

  /// Relative movement. Always the function form; see the prop's doc comment.
  const moveHook = useCallback(
    (compute: (previousMs: number) => number) => {
      if (readOnly) return;
      onHookStartMsChange((previous) => clampMs(compute(previous)));
    },
    [clampMs, onHookStartMsChange, readOnly],
  );

  const nudge = useCallback(
    (deltaMs: number) => moveHook((previous) => previous + deltaMs),
    [moveHook],
  );

  const snapZeroCrossing = useCallback(() => {
    if (!channel) return;
    moveHook((previous) =>
      sampleToMs(
        nearestZeroCrossing(
          channel,
          msToSample(previous),
          Math.round((ZERO_CROSS_MAX_MS / 1000) * sampleRate),
        ),
      ),
    );
  }, [channel, moveHook, msToSample, sampleRate, sampleToMs]);

  const snapFirstAudible = useCallback(() => {
    if (!analysis) return;
    setHook(sampleToMs(analysis.firstAudibleSample));
  }, [analysis, sampleToMs, setHook]);

  const goToOnset = useCallback(
    (direction: 1 | -1) => {
      if (!analysis) return;
      moveHook((previous) => {
        const next = stepOnset(analysis.onsetSamples, msToSample(previous), direction);
        // No onset left in that direction — hold position rather than jumping
        // to an end of the track.
        return next === null ? previous : sampleToMs(next);
      });
    },
    [analysis, moveHook, msToSample, sampleToMs],
  );

  const handleScrub = useCallback(
    (intent: ScrubIntent) => {
      const ms = sampleToMs(intent.sample);
      if (intent.auditionOnly) {
        playRange(ms, ms + Math.max(stageMs, 1200), false);
        return;
      }
      setHook(ms);
    },
    [playRange, sampleToMs, setHook, stageMs],
  );

  // Keep the hook inside the zoomed view.
  //
  // Anchoring the view rigidly to the hook would make the waveform slide under
  // the pointer while dragging, which is unusable; letting the hook drift off
  // screen is worse. So the window holds still until the hook comes within 15%
  // of an edge, then recentres.
  //
  // Adjusted DURING RENDER rather than in an effect — React's documented pattern
  // for state derived from changing props, and the same shape PlayerBar.tsx uses
  // for its audioUrl reset. An effect would render the stale window for a frame
  // first, which on a 40ms zoom is a visible jump.
  const zoomSpanMs = ZOOM_LEVELS_MS[zoomIndex]!;
  const [lastView, setLastView] = useState({ hookStartMs, zoomIndex });
  if (lastView.hookStartMs !== hookStartMs || lastView.zoomIndex !== zoomIndex) {
    setLastView({ hookStartMs, zoomIndex });
    const margin = zoomSpanMs * 0.15;
    const outOfView =
      hookStartMs < zoomCenterMs - zoomSpanMs / 2 + margin ||
      hookStartMs > zoomCenterMs + zoomSpanMs / 2 - margin;
    // Changing zoom always recentres: a new span around an old centre can put
    // the hook anywhere, including off screen.
    if (outOfView || lastView.zoomIndex !== zoomIndex) setZoomCenterMs(hookStartMs);
  }

  // --------------------------------------------------------------------------
  // Keyboard
  // --------------------------------------------------------------------------

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Never steal keys from the millisecond input or any other field.
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const step = event.shiftKey ? 1 : event.altKey ? 100 : event.ctrlKey || event.metaKey ? 1000 : 10;

      switch (event.key) {
        case " ":
          event.preventDefault();
          if (isPlaying) stop();
          else if (event.shiftKey) playFullWindow();
          else playStage();
          return;
        case "ArrowLeft":
          event.preventDefault();
          nudge(-step);
          return;
        case "ArrowRight":
          event.preventDefault();
          nudge(step);
          return;
        case "[":
          event.preventDefault();
          goToOnset(-1);
          return;
        case "]":
          event.preventDefault();
          goToOnset(1);
          return;
        case "z":
          event.preventDefault();
          snapZeroCrossing();
          return;
        default:
      }
    },
    [goToOnset, isPlaying, nudge, playFullWindow, playStage, snapZeroCrossing, stop],
  );

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const rungSamples = useMemo(
    () => ladder.map((rungMs) => msToSample(hookStartMs + rungMs)),
    [hookStartMs, ladder, msToSample],
  );

  if (!videoId) {
    return (
      <div className="rounded-xl border border-dashed border-(--hairline) p-8 text-center text-sm text-(--text-dim)">
        This song has no YouTube video id, so there is no audio to review.
      </div>
    );
  }

  if (load.status !== "ready" || !channel || !buffer) {
    return (
      <LoadingPanel
        state={load}
        onRetry={(force) => setReload((prev) => ({ token: prev.token + 1, force }))}
      />
    );
  }

  const zoomStartSample = msToSample(zoomCenterMs - zoomSpanMs / 2);
  const zoomEndSample = msToSample(zoomCenterMs + zoomSpanMs / 2);

  return (
    <div
      role="group"
      aria-label="Hook start editor"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-4 rounded-xl border border-(--hairline) bg-(--surface-strong) p-4 outline-none focus-visible:border-violet-500"
    >
      {/* Readout ------------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--text-faint)">
            Hook starts at
          </p>
          <p className="font-mono text-3xl font-semibold tabular-nums text-(--text)">
            {formatHookTime(hookStartMs)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--text-faint)">
            ms
          </label>
          <input
            type="number"
            min={0}
            step={1}
            disabled={readOnly}
            value={hookDraft ?? String(hookStartMs)}
            onChange={(event) => setHookDraft(event.target.value)}
            onBlur={() => {
              if (hookDraft !== null) {
                const parsed = Number.parseInt(hookDraft, 10);
                if (Number.isFinite(parsed)) setHook(parsed);
                setHookDraft(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setHookDraft(null);
                event.currentTarget.blur();
              }
            }}
            className="w-28 rounded-lg border border-(--hairline) bg-(--surface) px-3 py-1.5 text-right font-mono text-sm tabular-nums text-(--text) outline-none focus:border-violet-500 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs text-(--text-faint)">
            of {formatHookTime(durationMs)}
          </span>
        </div>
      </div>

      {/* Overview ------------------------------------------------------ */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--text-faint)">
            Whole track
          </p>
          <p className="text-[10px] text-(--text-faint)">
            {readOnly ? "Shift-click or click to audition" : "Click to place · shift-click to audition"}
          </p>
        </div>
        <WaveCanvas
          handleRef={overviewRef}
          data={channel}
          sampleRate={sampleRate}
          startSample={0}
          endSample={channel.length}
          hookSample={msToSample(hookStartMs)}
          rungSamples={rungSamples}
          height={84}
          readOnly={readOnly}
          onScrub={handleScrub}
          ariaLabel="Waveform of the whole track"
        />
      </div>

      {/* Zoom ---------------------------------------------------------- */}
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--text-faint)">
            Zoom · {zoomSpanMs >= 1000 ? `${zoomSpanMs / 1000}s` : `${zoomSpanMs}ms`} across
          </p>
          <div className="flex gap-1">
            {ZOOM_LEVELS_MS.map((span, index) => (
              <button
                key={span}
                type="button"
                onClick={() => setZoomIndex(index)}
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] transition ${
                  index === zoomIndex
                    ? "border-violet-500 bg-violet-500/10 text-violet-500"
                    : "border-(--hairline) text-(--text-faint) hover:bg-(--surface-hover)"
                }`}
              >
                {span >= 1000 ? `${span / 1000}s` : `${span}ms`}
              </button>
            ))}
          </div>
        </div>
        <WaveCanvas
          handleRef={zoomRef}
          data={channel}
          sampleRate={sampleRate}
          startSample={zoomStartSample}
          endSample={zoomEndSample}
          hookSample={msToSample(hookStartMs)}
          rungSamples={rungSamples}
          height={132}
          readOnly={readOnly}
          onScrub={handleScrub}
          showTimeGrid
          ariaLabel="Zoomed waveform around the hook start"
        />
      </div>

      {/* Transport ----------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={isPlaying ? stop : playStage}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          {isPlaying ? "■ Stop" : `▶ Stage 1 · ${stageMs}ms`}
        </button>
        <button
          type="button"
          onClick={playFullWindow}
          className="rounded-lg border border-(--hairline) px-3 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
        >
          ▶ Full window · {(fullWindowMs / 1000).toFixed(0)}s
        </button>
        <button
          type="button"
          onClick={playRunIn}
          title={`Play from ${RUN_IN_MS / 1000}s before the hook, so you hear it being entered`}
          className="rounded-lg border border-(--hairline) px-3 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
        >
          ▶ Run-in
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !loopStage;
            setLoopStage(next);
            if (isPlaying) playRange(hookStartMs, hookStartMs + stageMs, next);
          }}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            loopStage
              ? "border-violet-500 bg-violet-500/10 text-violet-500"
              : "border-(--hairline) text-(--text-dim) hover:bg-(--surface-hover)"
          }`}
        >
          ⟳ Loop stage 1
        </button>
      </div>

      {/* Nudges + snaps ------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-(--hairline)">
          {NUDGES.map((delta) => (
            <button
              key={delta}
              type="button"
              disabled={readOnly || (delta < 0 && hookStartMs <= 0)}
              onClick={() => nudge(delta)}
              className="border-r border-(--hairline) px-2.5 py-1.5 font-mono text-xs text-(--text-dim) transition last:border-r-0 hover:bg-(--surface-hover) hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {delta > 0 ? "+" : "−"}
              {Math.abs(delta) >= 1000 ? `${Math.abs(delta) / 1000}s` : `${Math.abs(delta)}`}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={readOnly}
          onClick={() => goToOnset(-1)}
          title="Jump to the previous detected onset ( [ )"
          className="rounded-lg border border-(--hairline) px-2.5 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover) disabled:opacity-35"
        >
          |◀ Onset
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => goToOnset(1)}
          title="Jump to the next detected onset ( ] )"
          className="rounded-lg border border-(--hairline) px-2.5 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover) disabled:opacity-35"
        >
          Onset ▶|
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={snapZeroCrossing}
          title="Snap to the nearest zero crossing, so playback doesn't start with a click ( z )"
          className="rounded-lg border border-(--hairline) px-2.5 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover) disabled:opacity-35"
        >
          Zero X
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={snapFirstAudible}
          title="Jump to the first audible sample in the track"
          className="rounded-lg border border-(--hairline) px-2.5 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover) disabled:opacity-35"
        >
          First sound
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-(--text-faint)">
        Keys: <kbd>space</kbd> stage 1 · <kbd>shift</kbd>+<kbd>space</kbd> full window ·{" "}
        <kbd>←</kbd>/<kbd>→</kbd> 10ms (<kbd>shift</kbd> 1ms, <kbd>alt</kbd> 100ms,{" "}
        <kbd>ctrl</kbd> 1s) · <kbd>[</kbd>/<kbd>]</kbd> onsets · <kbd>z</kbd> zero crossing
      </p>
    </div>
  );
}

function LoadingPanel({
  state,
  onRetry,
}: {
  state: LoadState;
  onRetry: (force: boolean) => void;
}) {
  if (state.status === "error") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Couldn&apos;t load audio
        </p>
        <p className="text-sm text-(--text-dim)">{state.message}</p>
        {state.canRetry && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onRetry(false)}
              className="rounded-lg border border-(--hairline) px-3 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => onRetry(true)}
              title="Discard the cached copy and pull the audio from YouTube again"
              className="rounded-lg border border-(--hairline) px-3 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
            >
              Re-extract
            </button>
          </div>
        )}
      </div>
    );
  }

  const message =
    state.status === "extracting"
      ? "Pulling the audio from YouTube and transcoding it. First time for this song — this can take a minute or two. It's cached afterwards, for every environment."
      : state.status === "downloading"
        ? "Loading the cached audio…"
        : state.status === "decoding"
          ? "Decoding and analysing the waveform…"
          : "Checking for cached audio…";

  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-(--hairline) bg-(--surface-strong) p-8 text-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" />
      <p className="max-w-md text-sm text-(--text-dim)">{message}</p>
      {state.status === "extracting" && (
        // A number that keeps moving is the difference between "slow" and
        // "broken" on a wait this long.
        <p className="font-mono text-xs tabular-nums text-(--text-faint)">
          {Math.round(state.waitedMs / 1000)}s elapsed
        </p>
      )}
    </div>
  );
}

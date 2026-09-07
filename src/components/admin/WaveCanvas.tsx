"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import { columnPeaks } from "./hook-audio";

/**
 * One window onto a decoded channel, drawn to a canvas.
 *
 * Two of these make the hook editor: an overview of the whole track and a
 * zoomed window measured in milliseconds. Both are the same component with a
 * different sample range.
 *
 * ---------------------------------------------------------------------------
 * Why the playhead is imperative
 * ---------------------------------------------------------------------------
 *
 * The playhead moves every frame. Holding it in React state would re-render
 * this component, its parent, and everything else in the drawer sixty times a
 * second to move one vertical line — for no benefit, because the line is drawn
 * to a canvas React does not manage anyway. So the parent's animation loop calls
 * `drawPlayhead()` through the ref and React never hears about it.
 *
 * ---------------------------------------------------------------------------
 * Why there are two canvases
 * ---------------------------------------------------------------------------
 *
 * The waveform is expensive to compute (a min/max scan over every sample in
 * view) and changes only when the range or the size does. The markers on top of
 * it are cheap and change constantly. So the waveform is rendered once into an
 * offscreen canvas, and every composite blits that and redraws only the markers.
 * Recomputing peaks per frame would make a nine-minute overview stutter during
 * playback.
 */

export type WaveCanvasHandle = {
  /// Move the playhead to an absolute sample index, or null to hide it.
  drawPlayhead: (sample: number | null) => void;
};

export type ScrubIntent = {
  sample: number;
  /// True when the gesture should only audition (move the playhead), leaving
  /// the hook where it is. Shift-click, and the only mode available on a locked
  /// song.
  auditionOnly: boolean;
};

type Props = {
  handleRef: RefObject<WaveCanvasHandle | null>;
  data: Float32Array;
  sampleRate: number;
  startSample: number;
  endSample: number;
  hookSample: number;
  /// Absolute sample offsets of each reveal-ladder rung end, ascending. Drawn as
  /// ticks so the reviewer can see which slice of audio each attempt unlocks.
  rungSamples: number[];
  height: number;
  readOnly: boolean;
  onScrub: (intent: ScrubIntent) => void;
  /// Time labels along the bottom. Off for the overview, where they'd crowd.
  showTimeGrid?: boolean;
  ariaLabel: string;
};

// Fixed rather than read from the theme's CSS variables: these are drawn to a
// canvas, which can't resolve a var(), and all of them read clearly against both
// the light and dark admin surfaces.
const COLOR_WAVE = "rgba(139, 92, 246, 0.85)";
const COLOR_WAVE_OUTSIDE = "rgba(139, 92, 246, 0.28)";
const COLOR_WINDOW_FILL = "rgba(139, 92, 246, 0.10)";
const COLOR_HOOK = "#f59e0b";
const COLOR_PLAYHEAD = "#ef4444";
const COLOR_RUNG = "rgba(148, 163, 184, 0.55)";
const COLOR_GRID = "rgba(148, 163, 184, 0.30)";
const COLOR_LABEL = "rgba(148, 163, 184, 0.95)";

/// Below this many samples per pixel the min/max bars degenerate — each column
/// holds one sample or less — and a polyline through the actual sample points is
/// both more accurate and more useful, because you can see the individual cycles
/// you are placing the hook inside.
const POLYLINE_THRESHOLD_SPP = 1.5;

export function WaveCanvas({
  handleRef,
  data,
  sampleRate,
  startSample,
  endSample,
  hookSample,
  rungSamples,
  height,
  readOnly,
  onScrub,
  showTimeGrid = false,
  ariaLabel,
}: Props) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /// The pre-rendered waveform, blitted by every composite.
  const waveLayerRef = useRef<HTMLCanvasElement | null>(null);
  const cssWidthRef = useRef(0);
  const playheadRef = useRef<number | null>(null);

  const lastRungSample = rungSamples.length > 0 ? rungSamples[rungSamples.length - 1]! : hookSample;

  const renderWaveLayer = useCallback(() => {
    const width = cssWidthRef.current;
    if (width === 0) return;

    const dpr = pixelRatio();
    // A fresh canvas each time rather than resizing the cached one in place:
    // resizing a canvas clears it anyway, so nothing is saved, and mutating an
    // object reached through a ref is exactly what the compiler's immutability
    // rule forbids. This runs on resize and range change, not per frame.
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, Math.floor(width * dpr));
    layer.height = Math.max(1, Math.floor(height * dpr));

    const ctx = layer.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const mid = height / 2;
    const amp = height / 2 - 2;
    const columns = Math.max(1, Math.floor(width));
    const samplesPerPixel = (endSample - startSample) / columns;
    const toX = (sample: number) =>
      ((sample - startSample) / Math.max(1, endSample - startSample)) * width;

    if (samplesPerPixel < POLYLINE_THRESHOLD_SPP) {
      // Deep zoom: draw the samples themselves. This is the view where a hook is
      // actually placed to the millisecond, and it should show real cycles
      // rather than a bar chart of one-sample columns.
      ctx.strokeStyle = COLOR_WAVE;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      const from = Math.max(0, Math.floor(startSample));
      const to = Math.min(data.length - 1, Math.ceil(endSample));
      for (let i = from; i <= to; i++) {
        const x = toX(i);
        const y = mid - (data[i] ?? 0) * amp;
        if (i === from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      const { min, max } = columnPeaks(data, startSample, endSample, columns);
      for (let column = 0; column < columns; column++) {
        const sampleAtColumn = startSample + samplesPerPixel * column;
        // Audio inside the playable window is drawn at full strength and
        // everything else dimmed, so the slice players actually hear is legible
        // at a glance rather than having to be traced from the tint.
        ctx.fillStyle =
          sampleAtColumn >= hookSample && sampleAtColumn <= lastRungSample
            ? COLOR_WAVE
            : COLOR_WAVE_OUTSIDE;
        const top = mid - max[column]! * amp;
        const bottom = mid - min[column]! * amp;
        ctx.fillRect(column, top, 1, Math.max(1, bottom - top));
      }
    }

    // Zero line last, so it reads through the waveform.
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(mid) + 0.5);
    ctx.lineTo(width, Math.round(mid) + 0.5);
    ctx.stroke();

    waveLayerRef.current = layer;
  }, [data, endSample, height, hookSample, lastRungSample, startSample]);

  const composite = useCallback(() => {
    const canvas = canvasRef.current;
    const waveLayer = waveLayerRef.current;
    const width = cssWidthRef.current;
    if (!canvas || !waveLayer || width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = pixelRatio();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const toX = (sample: number) =>
      ((sample - startSample) / Math.max(1, endSample - startSample)) * width;

    // Playable window first, so the waveform sits on top of the tint.
    const windowStartX = toX(hookSample);
    const windowEndX = toX(lastRungSample);
    if (windowEndX > 0 && windowStartX < width) {
      ctx.fillStyle = COLOR_WINDOW_FILL;
      ctx.fillRect(windowStartX, 0, Math.max(1, windowEndX - windowStartX), height);
    }

    ctx.drawImage(waveLayer, 0, 0, width, height);

    if (showTimeGrid) {
      drawTimeGrid(ctx, {
        height,
        startSample,
        endSample,
        hookSample,
        sampleRate,
        toX,
      });
    }

    ctx.strokeStyle = COLOR_RUNG;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const rung of rungSamples) {
      const x = Math.round(toX(rung)) + 0.5;
      if (x < 0 || x > width) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Hook marker, with a flag so it stays findable when the playhead sits on
    // top of it — which it does every time you press play.
    const hookX = Math.round(toX(hookSample)) + 0.5;
    if (hookX >= -1 && hookX <= width + 1) {
      ctx.strokeStyle = COLOR_HOOK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hookX, 0);
      ctx.lineTo(hookX, height);
      ctx.stroke();

      ctx.fillStyle = COLOR_HOOK;
      ctx.beginPath();
      ctx.moveTo(hookX, 0);
      ctx.lineTo(hookX + 9, 0);
      ctx.lineTo(hookX, 9);
      ctx.closePath();
      ctx.fill();
    }

    const playhead = playheadRef.current;
    if (playhead !== null) {
      const x = Math.round(toX(playhead)) + 0.5;
      if (x >= 0 && x <= width) {
        ctx.strokeStyle = COLOR_PLAYHEAD;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  }, [
    endSample,
    height,
    hookSample,
    lastRungSample,
    rungSamples,
    sampleRate,
    showTimeGrid,
    startSample,
  ]);

  const measureAndDraw = useCallback(() => {
    const canvas = canvasRef.current;
    const holder = holderRef.current;
    if (!canvas || !holder) return;

    const width = holder.clientWidth;
    if (width === 0) return;

    cssWidthRef.current = width;
    const dpr = pixelRatio();
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    renderWaveLayer();
    composite();
  }, [composite, height, renderWaveLayer]);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const observer = new ResizeObserver(measureAndDraw);
    observer.observe(holder);
    measureAndDraw();
    return () => observer.disconnect();
  }, [measureAndDraw]);

  useImperativeHandle(
    handleRef,
    () => ({
      drawPlayhead: (sample: number | null) => {
        playheadRef.current = sample;
        composite();
      },
    }),
    [composite],
  );

  const draggingRef = useRef<{ auditionOnly: boolean } | null>(null);

  const sampleAtClientX = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return startSample;
      const rect = canvas.getBoundingClientRect();
      const ratio = (clientX - rect.left) / Math.max(1, rect.width);
      return startSample + ratio * (endSample - startSample);
    },
    [endSample, startSample],
  );

  return (
    <div ref={holderRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className={`block w-full rounded-lg border border-(--hairline) bg-(--surface) ${
          readOnly ? "cursor-default" : "cursor-crosshair"
        }`}
        onPointerDown={(event) => {
          // Shift auditions without moving the hook, which is also the only
          // interaction left once the song is locked.
          const auditionOnly = event.shiftKey || readOnly;
          draggingRef.current = { auditionOnly };
          event.currentTarget.setPointerCapture(event.pointerId);
          onScrub({ sample: sampleAtClientX(event.clientX), auditionOnly });
        }}
        onPointerMove={(event) => {
          const drag = draggingRef.current;
          // Auditioning re-triggers playback on every scrub, so it must not fire
          // on drag — only the hook follows the pointer.
          if (!drag || drag.auditionOnly) return;
          onScrub({ sample: sampleAtClientX(event.clientX), auditionOnly: false });
        }}
        onPointerUp={(event) => {
          draggingRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = null;
        }}
      />
    </div>
  );
}

function drawTimeGrid(
  ctx: CanvasRenderingContext2D,
  view: {
    height: number;
    startSample: number;
    endSample: number;
    hookSample: number;
    sampleRate: number;
    toX: (sample: number) => number;
  },
): void {
  const { height, startSample, endSample, hookSample, sampleRate, toX } = view;
  const spanMs = ((endSample - startSample) / sampleRate) * 1000;

  // Ticks are placed relative to the HOOK, not to the track, and labelled as an
  // offset from it. At a 40ms zoom an absolute timestamp like "1:03.418" is
  // unreadable and answers a question nobody has; "-10ms / +10ms" is the number
  // the reviewer is actually reasoning about.
  const step = niceStepMs(spanMs);
  const hookMs = (hookSample / sampleRate) * 1000;
  const fromMs = (startSample / sampleRate) * 1000;
  const toMs = (endSample / sampleRate) * 1000;
  const firstTick = Math.ceil((fromMs - hookMs) / step) * step;

  ctx.strokeStyle = COLOR_GRID;
  ctx.fillStyle = COLOR_LABEL;
  ctx.lineWidth = 1;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";

  for (let offset = firstTick; hookMs + offset <= toMs; offset += step) {
    const ms = hookMs + offset;
    if (ms < fromMs) continue;
    const x = Math.round(toX((ms / 1000) * sampleRate)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, height - 12);
    ctx.lineTo(x, height);
    ctx.stroke();
    if (offset !== 0) ctx.fillText(formatOffset(offset), x, height - 15);
  }
}

function pixelRatio(): number {
  // Capped at 2: beyond that the peak scan costs more than the sharpness is
  // worth on a waveform made of one-pixel bars.
  return Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
}

/// A round tick interval giving roughly 6-10 gridlines across the view.
function niceStepMs(spanMs: number): number {
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000];
  const target = spanMs / 8;
  for (const step of candidates) if (step >= target) return step;
  return candidates[candidates.length - 1]!;
}

function formatOffset(ms: number): string {
  const sign = ms > 0 ? "+" : "";
  if (Math.abs(ms) >= 1000) return `${sign}${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  return `${sign}${Math.round(ms)}ms`;
}

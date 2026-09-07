/**
 * Analysis helpers for the hook editor, kept out of the component so the
 * signal-processing decisions are readable on their own.
 *
 * Everything here runs on a decoded AudioBuffer's channel data — the whole
 * reason the admin path extracts its own audio (see lib/admin/source-audio.ts)
 * rather than driving the YouTube iframe players use.
 */

/// Analysis frame. 5ms is short enough to place an onset inside the millisecond
/// the UI exposes and long enough that one noisy sample can't register as one.
const FRAME_MS = 5;

/// Percentile of frame energy taken as the track's "loud" reference. A high
/// percentile rather than the peak, so a single clipped transient can't define
/// the level for the whole track and push every threshold out of reach.
const REFERENCE_PERCENTILE = 0.95;

/// Fraction of the reference a frame must reach to count as audible. ~-32dB
/// relative to the track's loud level — below a quiet intro, above tape hiss,
/// dither and the noise floor of a lossy source decoded back to PCM.
const AUDIBLE_RATIO = 0.025;

export type WaveAnalysis = {
  /// Per-frame RMS over the whole track.
  frameRms: Float32Array;
  frameMs: number;
  /// The REFERENCE_PERCENTILE energy level, in the same units as frameRms.
  reference: number;
  /// Sample index of the first audible moment — the same question
  /// lib/catalog/detect-hook.ts answers server-side with ffmpeg's
  /// silencedetect, recomputed here so it is instant and matches what the
  /// waveform on screen is drawn from.
  firstAudibleSample: number;
  /// Sample indices of detected energy rises, ascending. What the prev/next
  /// onset controls step through.
  onsetSamples: number[];
};

/**
 * One pass over the channel producing everything the editor's snap controls
 * need.
 *
 * Onsets come from an energy-novelty function — the positive frame-to-frame
 * rise in RMS — with peaks picked above an adaptive threshold. This is the
 * cheap classical detector, not spectral flux: it reliably catches percussive
 * and vocal entries after a gap, which is the case that matters when placing a
 * hook, and it costs one linear scan instead of an FFT per frame. It will miss
 * a note that swells in without a transient; the waveform and the ear are the
 * backstop for those, which is why these are navigation controls and not an
 * automatic answer.
 */
export function analyseChannel(data: Float32Array, sampleRate: number): WaveAnalysis {
  const frameSize = Math.max(1, Math.round((FRAME_MS / 1000) * sampleRate));
  const frameCount = Math.max(1, Math.floor(data.length / frameSize));
  const frameRms = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize;
    let sum = 0;
    for (let i = start; i < start + frameSize; i++) {
      const sample = data[i]!;
      sum += sample * sample;
    }
    frameRms[frame] = Math.sqrt(sum / frameSize);
  }

  // Percentile via a sorted copy. frameCount is ~100k for a nine-minute track,
  // so this is a few milliseconds once, at decode time — not worth a selection
  // algorithm.
  const sorted = Float32Array.from(frameRms).sort();
  const reference = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * REFERENCE_PERCENTILE))] ?? 0;

  const audibleThreshold = reference * AUDIBLE_RATIO;

  let firstAudibleFrame = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    if (frameRms[frame]! > audibleThreshold) {
      firstAudibleFrame = frame;
      break;
    }
  }

  // Refine to the sample. The frame only says "somewhere in these 5ms", and 5ms
  // of slop is 1% of a 400ms stage-1 clip — enough to be worth removing.
  let firstAudibleSample = firstAudibleFrame * frameSize;
  const frameEnd = Math.min(data.length, firstAudibleSample + frameSize);
  for (let i = firstAudibleSample; i < frameEnd; i++) {
    if (Math.abs(data[i]!) > audibleThreshold) {
      firstAudibleSample = i;
      break;
    }
  }

  // Novelty: only rises count. A decay back to silence is not an onset.
  const novelty = new Float32Array(frameCount);
  for (let frame = 1; frame < frameCount; frame++) {
    novelty[frame] = Math.max(0, frameRms[frame]! - frameRms[frame - 1]!);
  }

  let noveltySum = 0;
  for (let i = 0; i < frameCount; i++) noveltySum += novelty[i]!;
  const noveltyMean = noveltySum / frameCount;

  let varianceSum = 0;
  for (let i = 0; i < frameCount; i++) {
    const d = novelty[i]! - noveltyMean;
    varianceSum += d * d;
  }
  const noveltyStd = Math.sqrt(varianceSum / frameCount);

  // Mean + 1.5 sigma: loose enough to catch a soft vocal entry, tight enough
  // that a steady groove doesn't mark every beat as an onset to step through.
  const onsetThreshold = noveltyMean + 1.5 * noveltyStd;

  /// Minimum gap between reported onsets. Below this they stop being places to
  /// navigate to and become a list of every drum hit.
  const minGapFrames = Math.round(50 / FRAME_MS);

  const onsetSamples: number[] = [];
  let lastOnsetFrame = -minGapFrames;
  for (let frame = 1; frame < frameCount - 1; frame++) {
    const value = novelty[frame]!;
    if (value < onsetThreshold) continue;
    // Local maximum, so a single rise spread over three frames reports once.
    if (value < novelty[frame - 1]! || value < novelty[frame + 1]!) continue;
    if (frame - lastOnsetFrame < minGapFrames) continue;
    lastOnsetFrame = frame;
    onsetSamples.push(frame * frameSize);
  }

  return { frameRms, frameMs: FRAME_MS, reference, firstAudibleSample, onsetSamples };
}

/**
 * Nearest sample to `sample` where the waveform crosses zero.
 *
 * Starting playback mid-cycle steps the speaker from silence to whatever the
 * instantaneous amplitude happens to be, and that discontinuity is an audible
 * click at the top of every single round. Landing on a zero crossing removes
 * it. The shift is at most a fraction of a cycle — under a millisecond for
 * anything but deep bass — so it never moves the hook anywhere musically
 * different.
 */
export function nearestZeroCrossing(
  data: Float32Array,
  sample: number,
  maxDistance: number,
): number {
  const clamped = Math.max(0, Math.min(data.length - 2, Math.round(sample)));

  for (let offset = 0; offset <= maxDistance; offset++) {
    const forward = clamped + offset;
    if (forward < data.length - 1 && crossesZero(data[forward]!, data[forward + 1]!)) {
      return forward;
    }
    const back = clamped - offset;
    if (back >= 0 && back < data.length - 1 && crossesZero(data[back]!, data[back + 1]!)) {
      return back;
    }
  }
  return clamped;
}

function crossesZero(a: number, b: number): boolean {
  return (a <= 0 && b > 0) || (a >= 0 && b < 0);
}

/// Nearest onset strictly before / after `sample`, or null when there is none
/// left in that direction.
export function stepOnset(
  onsetSamples: number[],
  sample: number,
  direction: 1 | -1,
): number | null {
  if (direction === 1) {
    for (const onset of onsetSamples) if (onset > sample + 1) return onset;
    return null;
  }
  for (let i = onsetSamples.length - 1; i >= 0; i--) {
    const onset = onsetSamples[i]!;
    if (onset < sample - 1) return onset;
  }
  return null;
}

/**
 * Per-column min/max of the channel over [startSample, endSample), one pair per
 * pixel.
 *
 * Min AND max rather than a single magnitude because a waveform drawn from
 * absolute values loses the asymmetry that makes a transient recognisable by
 * eye — and recognising the transient by eye is the whole point of drawing it.
 *
 * When a column spans fewer than one sample (deep zoom, past roughly 30ms
 * across the canvas) both entries collapse to the same interpolated value and
 * the caller draws a line through the actual sample points instead.
 */
export function columnPeaks(
  data: Float32Array,
  startSample: number,
  endSample: number,
  columns: number,
): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);
  const span = endSample - startSample;

  for (let column = 0; column < columns; column++) {
    const from = startSample + Math.floor((span * column) / columns);
    const to = startSample + Math.floor((span * (column + 1)) / columns);
    let lo = 0;
    let hi = 0;
    let seen = false;

    for (let i = Math.max(0, from); i < Math.min(data.length, Math.max(to, from + 1)); i++) {
      const sample = data[i]!;
      if (!seen) {
        lo = sample;
        hi = sample;
        seen = true;
      } else {
        if (sample < lo) lo = sample;
        if (sample > hi) hi = sample;
      }
    }

    min[column] = lo;
    max[column] = hi;
  }

  return { min, max };
}

/// `m:ss.mmm`. Milliseconds always shown to three places — this is a tool for
/// placing a millisecond, so a value that renders as "1:03.4" hides two digits
/// the reviewer is actively adjusting.
export function formatHookTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

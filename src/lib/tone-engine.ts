// Stand-in for the real cumulative-clip player described in
// docs/game-engine.md (PuzzleAsset.AUDIO_CLIP, signed per-stage URLs). Until
// that pipeline exists, each song gets a short deterministic synth "riff" —
// same song always sounds the same, different songs sound different — so the
// reveal-ladder mechanic can be felt end to end with zero network audio.

import type { Song } from "@/data/songs";

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const ROOT = 220; // A3

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noteFrequency(semitoneIndex: number) {
  return ROOT * Math.pow(2, semitoneIndex / 12);
}

// One note = one "beat" for visualization purposes — PlayerBar reads this
// same interval to pulse the waveform in sync with what's actually playing,
// rather than an arbitrary decorative shimmer.
export const NOTE_MS = 380;
const NOTE_COUNT = 44; // 44 * 380ms ≈ 16.7s — clears the ladder's 16s ceiling

export function getRiff(song: Song) {
  const random = mulberry32(hashString(song.id));
  const notes: { startMs: number; freq: number }[] = [];
  for (let i = 0; i < NOTE_COUNT; i++) {
    const degree = PENTATONIC[Math.floor(random() * PENTATONIC.length)];
    const octave = random() > 0.8 ? 12 : 0;
    notes.push({ startMs: i * NOTE_MS, freq: noteFrequency(degree + octave) });
  }
  return notes;
}

export class ToneEngine {
  private ctx: AudioContext | null = null;
  private activeNodes: AudioScheduledSourceNode[] = [];
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  onEnded: (() => void) | null = null;

  private ensureContext() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  play(song: Song, durationMs: number) {
    this.stop();
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const riff = getRiff(song);
    const noteDurationSec = (NOTE_MS / 1000) * 0.92;

    for (const note of riff) {
      if (note.startMs >= durationMs) continue;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = note.freq;

      const startAt = now + note.startMs / 1000;
      const peak = 0.16;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + noteDurationSec);

      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + noteDurationSec + 0.02);
      this.activeNodes.push(osc);
    }

    this.stopTimer = setTimeout(() => {
      this.onEnded?.();
    }, durationMs);
  }

  stop() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.activeNodes = [];
  }

  dispose() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
  }
}

/// A glowing radial spike-burst ring, deterministically generated (no
/// Math.random — same label always draws the same burst) rather than a
/// generic spinner. Styled after a reference "audio equalizer starburst"
/// image the user shared, but kept in the app's own amber "signal" palette
/// instead of that image's neon rainbow, so it reads as part of this UI
/// rather than a dropped-in stock asset.

const SPIKE_COUNT = 96;
const CENTER = 100;
const INNER_RADIUS = 44;
/// Every 24th ray (4 total, on the cardinal points once rotated) reads as a
/// long bright beam — the cross-shaped highlight in the reference image.
const BEAM_STRIDE = 24;

/// Deterministic pseudo-randomness — a fractional-sine hash — so the spike
/// lengths look organic (not a perfect sunburst) without needing real
/// randomness or per-render variation.
function hash(i: number): number {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  return seed - Math.floor(seed);
}

const SPIKES = Array.from({ length: SPIKE_COUNT }, (_, i) => {
  const angle = (i / SPIKE_COUNT) * Math.PI * 2;
  const isBeam = i % BEAM_STRIDE === 0;
  const len = isBeam ? 52 : 12 + hash(i) * 30;
  return {
    key: i,
    isBeam,
    x1: CENTER + Math.cos(angle) * INNER_RADIUS,
    y1: CENTER + Math.sin(angle) * INNER_RADIUS,
    x2: CENTER + Math.cos(angle) * (INNER_RADIUS + len),
    y2: CENTER + Math.sin(angle) * (INNER_RADIUS + len),
  };
});

const FLARES = [
  { key: "a", cx: 46, cy: 62, r: 2.2 },
  { key: "b", cx: 150, cy: 74, r: 1.4 },
  { key: "c", cx: 138, cy: 140, r: 1.8 },
];

export function SpikeBurstLoader({ label, caption }: { label: string; caption: string }) {
  return (
    <div className="relative flex h-52 w-52 shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full animate-[spin_14s_linear_infinite]"
        aria-hidden="true"
      >
        <defs>
          <filter id="spike-burst-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g stroke="var(--signal)" strokeLinecap="round" filter="url(#spike-burst-glow)">
          {SPIKES.map((s) => (
            <line
              key={s.key}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              strokeWidth={s.isBeam ? 1.1 : 1}
              opacity={s.isBeam ? 0.9 : 0.45}
            />
          ))}
        </g>
        <g fill="var(--signal)" filter="url(#spike-burst-glow)">
          {FLARES.map((f) => (
            <circle key={f.key} cx={f.cx} cy={f.cy} r={f.r} opacity="0.85" />
          ))}
        </g>
      </svg>
      <span
        className="absolute h-24 w-24 rounded-full border"
        style={{ borderColor: "color-mix(in srgb, var(--signal) 65%, transparent)" }}
        aria-hidden="true"
      />
      <span
        className="absolute h-20 w-20 rounded-full border shadow-[0_0_20px_rgba(242,184,75,0.4)]"
        style={{ borderColor: "color-mix(in srgb, var(--signal) 30%, transparent)" }}
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col items-center text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-(--text)">{label}</p>
        <p className="mt-1 text-xs text-(--text-dim)">{caption}</p>
      </div>
    </div>
  );
}

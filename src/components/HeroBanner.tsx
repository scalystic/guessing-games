"use client";

// A flat, abstract silhouette rather than a photorealistic illustration —
// procedurally drawing a convincing figure is out of reach here, so this
// leans into simple geometric shapes instead of attempting a bad likeness.
function DancerSilhouette() {
  return (
    <svg viewBox="0 0 120 160" className="h-full w-auto opacity-80" aria-hidden="true">
      <defs>
        <linearGradient id="dancerFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {/* flowing skirt */}
      <path
        d="M60 60 C20 75 10 130 15 155 C40 145 80 145 105 155 C110 130 100 75 60 60 Z"
        fill="url(#dancerFade)"
      />
      {/* torso + raised arm */}
      <path
        d="M60 60 C52 55 48 42 52 32 C55 24 65 24 68 32 C71 42 68 55 60 60 Z"
        fill="url(#dancerFade)"
      />
      <path d="M64 40 C78 34 92 22 96 10" stroke="url(#dancerFade)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="60" cy="20" r="9" fill="url(#dancerFade)" />
    </svg>
  );
}

export function HeroBanner({ from, to }: { from: string; to: string }) {
  return (
    <div
      className="relative flex items-center justify-between overflow-hidden rounded-2xl px-5 py-5"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div className="relative z-10 max-w-[65%]">
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-white drop-shadow">
          Name That Tune <span aria-hidden="true">🎵</span>
        </p>
        <p className="mt-1 text-sm text-white/85">
          Listen to the intro. Every unlock gives you more seconds.
        </p>
      </div>
      <div className="relative z-10 h-24 shrink-0 sm:h-28">
        <DancerSilhouette />
      </div>
      <span className="pointer-events-none absolute left-6 top-3 text-lg text-white/50" aria-hidden="true">
        ♪
      </span>
      <span className="pointer-events-none absolute right-24 bottom-4 text-sm text-white/40" aria-hidden="true">
        ♫
      </span>
    </div>
  );
}

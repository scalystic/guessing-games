"use client";

import { useMemo } from "react";

const COLORS = ["#cf9c4e", "#c087a0", "#c17a6b", "#5aa89c", "#9a5138"];

/// Falls over whatever it is placed inside — `absolute inset-0`, so the nearest
/// positioned ancestor decides whether that is a card or the whole viewport.
///
/// Every value is derived from the piece's index rather than Math.random(): the
/// spread is already irregular enough to read as scattered, and a deterministic
/// one renders identically on the server and on the client instead of tripping
/// hydration.
export function Confetti({ accent }: { accent: string }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 12) * 0.08,
        duration: 1.8 + ((i * 13) % 10) / 10,
        color: i % 6 === 0 ? accent : COLORS[i % COLORS.length],
        rotate: (i * 47) % 360,
        drift: ((i * 29) % 60) - 30,
      })),
    [accent],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-fall absolute top-0 h-2 w-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // Custom properties, not a `transform`: the keyframe animates
            // transform, and an animated property always wins over the inline
            // style it would otherwise be read from.
            ...({
              "--drift": `${p.drift}px`,
              "--tilt": `${p.rotate}deg`,
            } as React.CSSProperties),
          }}
        />
      ))}
    </div>
  );
}

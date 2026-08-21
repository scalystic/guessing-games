"use client";

import { useMemo } from "react";

const COLORS = ["#f6c453", "#e84393", "#e67e22", "#0f9b8e", "#c0392b"];

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
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-[-12px] h-2 w-2 rounded-sm confetti-fall"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // @ts-expect-error custom property for the keyframe
            "--drift": `${p.drift}px`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

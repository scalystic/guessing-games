"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { getServerThemeMode, getThemeMode, subscribeThemeMode } from "@/lib/theme-mode";

type Particle = {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  opacity: number;
  glyph?: string;
};

const GLYPHS = ["♪", "♫", "♬"];
const PARTICLE_COUNT = 34;

// A canvas-driven "live" backdrop — slow-drifting glowing dots and music
// notes — rather than an actual video file. No asset to source/license,
// no network weight, and it respects prefers-reduced-motion.
export function LiveBackground() {
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeMode, getServerThemeMode);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode !== "dark") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1 + Math.random() * 2.5,
      speed: 0.12 + Math.random() * 0.3,
      drift: (Math.random() - 0.5) * 0.25,
      opacity: 0.12 + Math.random() * 0.28,
      glyph: Math.random() > 0.85 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : undefined,
    }));

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
    }
    window.addEventListener("resize", resize);

    let raf = 0;
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.globalAlpha = p.opacity;
        if (p.glyph) {
          ctx.fillStyle = "#8fa5ff";
          ctx.font = `${Math.round(p.r * 6)}px sans-serif`;
          ctx.fillText(p.glyph, p.x, p.y);
        } else {
          ctx.fillStyle = "#a8b8ff";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (prefersReducedMotion) return;

      for (const p of particles) {
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  if (mode !== "dark") return null;

  return (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
  );
}

"use client";

import { useEffect, useState } from "react";

// A clock the component subscribes to, rather than reading Date.now()
// directly during render (impure, and would drift from what was rendered
// at hydration time). Starts at 0 — deterministic for SSR — and syncs to
// the real time once mounted, then every `intervalMs`.
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

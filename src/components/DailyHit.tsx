"use client";

import { useEffect, useMemo, useState } from "react";
import { SONGS, type Song } from "@/data/songs";
import { PlayerBar } from "./PlayerBar";
import { GuessAutocomplete } from "./GuessAutocomplete";
import { REVEAL_LADDER_MS } from "@/hooks/useMelodleGame";

const MAX_DAILY_ATTEMPTS = 3;
const STORAGE_KEY = "sargam-daily-v1";

type DailyStatus = "PENDING" | "SOLVED" | "FAILED";

type StoredState = {
  dateKey: string;
  attemptsUsed: number;
  status: DailyStatus;
  guessedIds: string[];
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dailyTargetIndex() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return seed % SONGS.length;
}

// Only ever mounts after a click (opening this modal), never during SSR or
// hydration — so reading localStorage straight in these initializers has
// no server/client value to disagree with.
function loadStored(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    return parsed.dateKey === todayKey() ? parsed : null;
  } catch {
    return null;
  }
}

export function DailyHit({ accent }: { accent: string }) {
  const target = useMemo(() => SONGS[dailyTargetIndex()], []);
  const stored = useMemo(() => loadStored(), []);

  const [attemptsUsed, setAttemptsUsed] = useState(stored?.attemptsUsed ?? 0);
  const [status, setStatus] = useState<DailyStatus>(stored?.status ?? "PENDING");
  const [guessedIds, setGuessedIds] = useState<string[]>(stored?.guessedIds ?? []);

  useEffect(() => {
    const state: StoredState = { dateKey: todayKey(), attemptsUsed, status, guessedIds };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing / storage disabled — the round still works, it
      // just won't be remembered if the modal is reopened.
    }
  }, [attemptsUsed, status, guessedIds]);

  const excludeIds = useMemo(() => new Set(guessedIds), [guessedIds]);
  const revealMs = REVEAL_LADDER_MS[Math.min(attemptsUsed, MAX_DAILY_ATTEMPTS - 1)];
  const resolved = status !== "PENDING";

  function submit(song: Song | null, skip = false) {
    if (resolved) return;
    if (song) setGuessedIds((ids) => [...ids, song.id]);

    if (!skip && song?.id === target.id) {
      setStatus("SOLVED");
      return;
    }
    const next = attemptsUsed + 1;
    setAttemptsUsed(next);
    if (next >= MAX_DAILY_ATTEMPTS) setStatus("FAILED");
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-xs text-(--text-faint)">
        One song, the same for everyone today — {MAX_DAILY_ATTEMPTS} attempts, resets at midnight.
      </p>

      <PlayerBar song={target} revealMs={revealMs} accent={accent} locked={resolved} />

      <div className="flex justify-center gap-1.5">
        {Array.from({ length: MAX_DAILY_ATTEMPTS }, (_, i) => {
          const used = i < attemptsUsed;
          const isCurrent = !resolved && i === attemptsUsed;
          return (
            <span
              key={i}
              className="h-2 flex-1 rounded-full transition-colors"
              style={{
                background: isCurrent ? accent : used ? "var(--text-faint)" : "var(--surface-hover)",
                boxShadow: isCurrent ? `0 0 8px ${accent}` : "none",
              }}
            />
          );
        })}
      </div>

      {!resolved && (
        <GuessAutocomplete
          songs={SONGS}
          excludeIds={excludeIds}
          accent={accent}
          onGuess={(song) => submit(song)}
          onSkip={() => submit(null, true)}
        />
      )}

      {resolved && (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-(--hairline) bg-(--surface) p-4 text-center">
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: status === "SOLVED" ? "#34d399" : "#f87171" }}
          >
            {status === "SOLVED" ? "Solved!" : "Not today"}
          </p>
          <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
            {target.title}
          </p>
          <p className="text-sm text-(--text-dim)">
            {target.artist} · {target.album} · {target.year}
          </p>
          <p className="mt-1 text-xs text-(--text-faint)">Come back tomorrow for the next one.</p>
        </div>
      )}
    </div>
  );
}

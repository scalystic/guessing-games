"use client";

import { useState, useTransition } from "react";
import type { SongRow } from "./songs-list";

type Props = {
  song: SongRow;
  /// Handed the updated row, so the list patches in place instead of refetching
  /// — the same contract the review drawer uses. A refetch here would make the
  /// row you just drafted jump off the page mid-click on the "All" tab.
  onSaved: (song: SongRow) => void;
};

/**
 * Draft / recover, from the catalog list.
 *
 * Drafting is the answer to "I don't want this song in the list" that Delete
 * used to be the only answer to. It writes Puzzle.isBlocked through
 * PATCH /api/admin/songs/[puzzleId], so the song stops being sampled into runs
 * and stops being an accepted guess immediately, while the row, its hook, its
 * popularity and its ingest history all stay exactly where they were. Recovery
 * puts it back in review — never straight back into rotation, because the
 * server clears the lock on the way in.
 *
 * No confirm dialog: that gesture is Delete's, and it is there because deleting
 * can't be undone. Making a reversible action feel as heavy as an irreversible
 * one is how admins learn to click through both.
 */
export function DraftSongButton({ song, onSaved }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const drafted = song.isBlocked;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/songs/${song.puzzleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDraft: !drafted }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          setError(json?.error?.message ?? "Couldn't save.");
          return;
        }
        onSaved({
          ...song,
          isBlocked: json.data.isBlocked,
          // Drafting unlocks server-side, so the row's lock state and badge have
          // to come back from the response rather than being assumed unchanged.
          isLocked: json.data.isLocked,
          lockedAt: json.data.lockedAt,
        });
      } catch {
        setError("Network error.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        title={
          drafted
            ? "Put this song back in the review queue"
            : "Set this song aside — out of rotation, nothing deleted, reversible"
        }
        className={
          drafted
            ? "rounded-md border border-violet-500/40 px-2.5 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-500/10 disabled:opacity-50 dark:text-violet-400"
            : "rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-600 transition hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-400"
        }
      >
        {isPending ? (drafted ? "Recovering…" : "Drafting…") : drafted ? "↩ Recover" : "Draft"}
      </button>
      {error && (
        <p className="max-w-48 text-right text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

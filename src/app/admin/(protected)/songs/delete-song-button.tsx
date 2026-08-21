"use client";

import { useState, useTransition } from "react";

type Props = {
  puzzleId: string;
  title: string;
  onDeleted: () => void;
};

// A native <form> can't gate on a confirm dialog or show the friendly
// RESTRICT-violation message inline, so this calls DELETE /api/song/[puzzleId]
// directly from a client transition instead. onDeleted refetches the
// client-owned song list rather than router.refresh(), which only
// invalidates the RSC render tree and wouldn't touch this list's local
// fetch results.
export function DeleteSongButton({ puzzleId, title, onDeleted }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/song/${puzzleId}`, { method: "DELETE" });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        setError(json?.error?.message ?? "Something went wrong deleting the song.");
        return;
      }
      onDeleted();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="max-w-48 text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

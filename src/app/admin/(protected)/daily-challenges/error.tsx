"use client";

import { useEffect } from "react";

export default function DailyChallengesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-(--hairline) bg-(--surface-strong) p-10 text-center">
      <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
        Couldn&apos;t load daily challenges
      </p>
      <p className="max-w-md text-sm text-(--text-dim)">
        {error.message || "Something went wrong while loading this page."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}

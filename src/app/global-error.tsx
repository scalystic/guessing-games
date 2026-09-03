"use client";

import { useEffect } from "react";
import "./globals.css";

// Only mounts when an error escapes every nested error.tsx boundary. Next.js
// swaps this in for the whole root layout (it must define its own <html>/
// <body>), which is why an uncaught error anywhere used to blank the page
// with no way to recover — this at least offers a reload.
export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 bg-(--bg) p-10 text-center text-(--text)">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold">
          Something went wrong
        </p>
        <p className="max-w-md text-sm text-(--text-dim)">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          Try again
        </button>
      </body>
    </html>
  );
}

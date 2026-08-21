"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { LiveBackground } from "@/components/LiveBackground";
import { getServerThemeColor, getThemeColor, subscribeThemeColor } from "@/lib/theme-color";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useSyncExternalStore(subscribeThemeColor, getThemeColor, getServerThemeColor);

  return (
    <div className="page-backdrop relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12 text-(--text)">
      <LiveBackground />

      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2.5"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-black shadow-lg"
            style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
          >
            🎬
          </span>
          <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-(--text)">
            Sargam
          </span>
        </Link>

        <div
          className="rounded-3xl border p-8 shadow-2xl shadow-black/20 backdrop-blur-sm dark:shadow-black/50"
          style={{ borderColor: `${theme.solid}30`, background: "var(--surface-strong)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

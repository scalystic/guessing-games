"use client";

import Link from "next/link";
import { useTransition } from "react";
import { logout } from "@/lib/auth/actions";

type UserNavProps = {
  /** null = no session / guest without name */
  user: {
    displayName: string | null;
    kind: "GUEST" | "USER";
  } | null;
};

export default function UserNav({ user }: UserNavProps) {
  const [isPending, startTransition] = useTransition();

  if (!user || user.kind === "GUEST") {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-md"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2.5">
        {/* Avatar circle with initial */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white">
          {(user.displayName ?? "U").charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          {user.displayName ?? "Player"}
        </span>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => logout())}
        className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        {isPending ? "…" : "Log out"}
      </button>
    </div>
  );
}

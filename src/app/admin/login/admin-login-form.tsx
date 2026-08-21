"use client";

import { useActionState } from "react";
import { adminLogin } from "@/lib/admin/actions";

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLogin, undefined);

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Admin Console
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to manage the song catalog and view player activity.
        </p>
      </div>

      {state?.message && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {state.message}
        </div>
      )}

      {/* Email */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="admin-email"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="admin@example.com"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-violet-400 dark:focus:ring-violet-400/20"
        />
        {state?.errors?.email && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {state.errors.email[0]}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="admin-password"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-violet-400 dark:focus:ring-violet-400/20"
        />
        {state?.errors?.password && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {state.errors.password[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-11 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Signing in…
          </span>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

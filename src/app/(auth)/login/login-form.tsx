"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { login } from "@/lib/auth/actions";
import GoogleButton from "@/app/components/auth/google-button";
import { getServerThemeColor, getThemeColor, subscribeThemeColor } from "@/lib/theme-color";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const theme = useSyncExternalStore(subscribeThemeColor, getThemeColor, getServerThemeColor);
  const ACCENT = theme.solid;

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-(--text)">
          Welcome back
        </h1>
        <p className="text-sm text-(--text-dim)">
          Log in to pick up where you left off.
        </p>
      </div>

      {state?.message && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(193,122,107,0.12)", color: "#c17a6b" }}
        >
          {state.message}
        </div>
      )}

      <GoogleButton />

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-(--hairline)" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-(--surface-strong) px-2 text-(--text-faint)">
            Or continue with email
          </span>
        </div>
      </div>

      {/* Email */}
      <div className="flex flex-col gap-2">
        <label htmlFor="login-email" className="text-sm font-medium text-(--text-dim)">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="rounded-xl border-2 bg-(--surface) px-3.5 py-2.5 text-sm text-(--text) outline-none transition-colors placeholder:text-(--text-dim)"
          style={{ borderColor: `${ACCENT}30` }}
        />
        {state?.errors?.email && (
          <p className="text-xs" style={{ color: "#c17a6b" }}>
            {state.errors.email[0]}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-2">
        <label htmlFor="login-password" className="text-sm font-medium text-(--text-dim)">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          className="rounded-xl border-2 bg-(--surface) px-3.5 py-2.5 text-sm text-(--text) outline-none transition-colors placeholder:text-(--text-dim)"
          style={{ borderColor: `${ACCENT}30` }}
        />
        {state?.errors?.password && (
          <p className="text-xs" style={{ color: "#c17a6b" }}>
            {state.errors.password[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-black shadow-sm transition enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
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
            Logging in…
          </span>
        ) : (
          "Log in"
        )}
      </button>

      {/* Signup link */}
      <p className="text-center text-sm text-(--text-dim)">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium transition-colors" style={{ color: ACCENT }}>
          Sign up
        </Link>
      </p>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { signup } from "@/lib/auth/actions";
import GoogleButton from "@/app/components/auth/google-button";
import { getServerThemeColor, getThemeColor, subscribeThemeColor } from "@/lib/theme-color";

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const theme = useSyncExternalStore(subscribeThemeColor, getThemeColor, getServerThemeColor);
  const ACCENT = theme.solid;

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-(--text)">
          Create your account
        </h1>
        <p className="text-sm text-(--text-dim)">
          Your guest progress will be saved automatically.
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

      {/* Display name */}
      <div className="flex flex-col gap-2">
        <label htmlFor="signup-displayName" className="text-sm font-medium text-(--text-dim)">
          Display name
        </label>
        <input
          id="signup-displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          placeholder="Your name"
          className="rounded-xl border-2 bg-(--surface) px-3.5 py-2.5 text-sm text-(--text) outline-none transition-colors placeholder:text-(--text-dim)"
          style={{ borderColor: `${ACCENT}30` }}
        />
        {state?.errors?.displayName && (
          <p className="text-xs" style={{ color: "#c17a6b" }}>
            {state.errors.displayName[0]}
          </p>
        )}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-2">
        <label htmlFor="signup-email" className="text-sm font-medium text-(--text-dim)">
          Email
        </label>
        <input
          id="signup-email"
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
        <label htmlFor="signup-password" className="text-sm font-medium text-(--text-dim)">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="rounded-xl border-2 bg-(--surface) px-3.5 py-2.5 text-sm text-(--text) outline-none transition-colors placeholder:text-(--text-dim)"
          style={{ borderColor: `${ACCENT}30` }}
        />
        {state?.errors?.password && (
          <ul className="flex flex-col gap-0.5 text-xs" style={{ color: "#c17a6b" }}>
            {state.errors.password.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
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
            Creating account…
          </span>
        ) : (
          "Create account"
        )}
      </button>

      {/* Login link */}
      <p className="text-center text-sm text-(--text-dim)">
        Already have an account?{" "}
        <Link href="/login" className="font-medium transition-colors" style={{ color: ACCENT }}>
          Log in
        </Link>
      </p>
    </form>
  );
}

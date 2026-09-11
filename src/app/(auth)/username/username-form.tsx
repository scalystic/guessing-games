"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { setUsername } from "@/lib/auth/username-action";
import { normalizeUsername } from "@/lib/auth/username";
import { getServerThemeColor, getThemeColor, subscribeThemeColor } from "@/lib/theme-color";

export default function UsernameForm({
  next,
  suggestion,
}: {
  next: string;
  /// Seeded from the account's display name, cleaned into a legal handle. Just
  /// a starting point — a suggestion they can accept with one tap beats an
  /// empty box, and the field stays fully editable.
  suggestion: string;
}) {
  const [state, action, pending] = useActionState(setUsername, undefined);
  const [value, setValue] = useState(suggestion);
  const theme = useSyncExternalStore(subscribeThemeColor, getThemeColor, getServerThemeColor);
  const ACCENT = theme.solid;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-(--text)">
          Pick your username
        </h1>
        <p className="text-sm text-(--text-dim)">
          This is how you appear on the leaderboard. It has to be unique, and
          everyone can see it.
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

      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-sm font-medium text-(--text-dim)">
          Username
        </label>
        <div className="flex items-center gap-0 rounded-xl border-2 bg-(--surface) px-3.5" style={{ borderColor: `${ACCENT}30` }}>
          <span className="shrink-0 font-mono text-sm text-(--text-faint)" aria-hidden="true">@</span>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            // Normalized as they type, so the field always shows exactly what
            // will be stored — no surprise lowercasing after submit.
            value={value}
            onChange={(event) => setValue(normalizeUsername(event.target.value))}
            placeholder="yourname"
            className="w-full bg-transparent py-2.5 font-mono text-sm text-(--text) outline-none placeholder:text-(--text-dim)"
            aria-describedby="username-hint"
          />
        </div>
        <p id="username-hint" className="text-xs text-(--text-faint)">
          3–20 characters. Lowercase letters, numbers and underscores.
        </p>
        {state?.errors?.username && (
          <p className="text-xs" style={{ color: "#c17a6b" }}>
            {state.errors.username[0]}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-black shadow-sm transition enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {pending ? "Saving…" : "Claim username"}
      </button>

      {/* No skip link on purpose: every account needs a username, and this is
          the only screen that asks for one. */}
    </form>
  );
}

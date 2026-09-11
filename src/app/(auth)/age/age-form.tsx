"use client";

import { useActionState, useSyncExternalStore } from "react";
import { setAge } from "@/lib/auth/age-action";
import AgeSlider from "@/app/components/auth/age-slider";
import { getServerThemeColor, getThemeColor, subscribeThemeColor } from "@/lib/theme-color";

export default function AgeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(setAge, undefined);
  const theme = useSyncExternalStore(subscribeThemeColor, getThemeColor, getServerThemeColor);
  const accent = theme.solid;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-(--text)">
          How old are you?
        </h1>
        <p className="text-sm text-(--text-dim)">
          Choose your age below. Google does not share this information with
          us, so please enter it directly.
        </p>
      </div>

      {state?.message ? (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(193,122,107,0.12)", color: "#c17a6b" }}
        >
          {state.message}
        </div>
      ) : null}

      <AgeSlider id="age" accent={accent} error={state?.errors?.age?.[0]} autoFocus />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-black shadow-sm transition enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: accent }}
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

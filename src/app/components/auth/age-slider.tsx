"use client";

import { useState } from "react";
import {
  DEFAULT_USER_AGE,
  MAXIMUM_USER_AGE,
  MINIMUM_USER_AGE,
} from "@/lib/auth/age-policy";

type AgeSliderProps = {
  id: string;
  accent: string;
  error?: string;
  autoFocus?: boolean;
};

export default function AgeSlider({
  id,
  accent,
  error,
  autoFocus,
}: AgeSliderProps) {
  const [age, setAge] = useState(DEFAULT_USER_AGE);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-(--text-dim)">
          Age
        </label>
        <output
          htmlFor={id}
          className="min-w-11 rounded-lg px-2.5 py-1 text-center text-sm font-semibold text-black"
          style={{ background: accent }}
          aria-live="polite"
        >
          {age}
        </output>
      </div>

      <input
        id={id}
        name="age"
        type="range"
        required
        autoFocus={autoFocus}
        min={MINIMUM_USER_AGE}
        max={MAXIMUM_USER_AGE}
        step={1}
        value={age}
        onChange={(event) => setAge(Number(event.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: accent }}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-valuetext={`${age} years old`}
      />

      <div
        className="flex justify-between text-xs text-(--text-faint)"
        aria-hidden="true"
      >
        <span>{MINIMUM_USER_AGE}</span>
        <span>{MAXIMUM_USER_AGE}</span>
      </div>

      <p id={hintId} className="text-xs text-(--text-faint)">
        Your age is private and is not shown to other players.
      </p>
      {error ? (
        <p id={errorId} className="text-xs" style={{ color: "#c17a6b" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";

type Props = {
  onClose: () => void;
  onCreate: () => Promise<string | null>;
  onJoin: (code: string) => Promise<string | null>;
};

const NAME_STORAGE_KEY = "sargam.playerName";

function loadSavedName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    // Private browsing, storage disabled, etc. — just start blank.
    return "";
  }
}

/// Sets Player.displayName server-side so real names — not the generic
/// "Player" fallback — show up in chat, round announcements, and the
/// leaderboard. Guests have no name at all otherwise (see lib/guest.ts);
/// this is the only place in the app that gives them one.
async function saveDisplayName(name: string): Promise<string | null> {
  try {
    const res = await fetch("/api/players/display-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return body?.error?.message ?? "Couldn't save your name.";
    try {
      window.localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch {
      // Non-fatal — the name is already saved server-side either way.
    }
    return null;
  } catch {
    return "Network error — check your connection.";
  }
}

export function MultiplayerPickerModal({ onClose, onCreate, onJoin }: Props) {
  const [name, setName] = useState(loadSavedName);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const busy = creating || joining;

  function requireName(): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "Enter a name so other players can see who you are.";
    return null;
  }

  async function submitCreate() {
    if (busy) return;
    const nameError = requireName();
    if (nameError) {
      setError(nameError);
      return;
    }
    setCreating(true);
    setError(null);
    const nameFailure = await saveDisplayName(name.trim());
    if (nameFailure) {
      setError(nameFailure);
      setCreating(false);
      return;
    }
    const failure = await onCreate();
    setCreating(false);
    if (failure) setError(failure);
  }

  async function submitJoin() {
    if (busy) return;
    const nameError = requireName();
    if (nameError) {
      setError(nameError);
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a room code to join.");
      return;
    }
    setJoining(true);
    setError(null);
    const nameFailure = await saveDisplayName(name.trim());
    if (nameFailure) {
      setError(nameFailure);
      setJoining(false);
      return;
    }
    const failure = await onJoin(trimmed);
    setJoining(false);
    if (failure) setError(failure);
  }

  return (
    <Modal title="Multiplayer" onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1.5 px-0.5">
          <label htmlFor="player-name-input" className="text-[11.5px] font-semibold text-(--text-dim)">
            Your name
          </label>
          <input
            id="player-name-input"
            type="text"
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={24}
            placeholder="What should we call you?"
            autoComplete="off"
            className="h-[42px] rounded-[7px] border border-(--hairline) bg-(--surface-strong) px-3 text-sm text-(--text) outline-none placeholder:text-(--text-faint) focus:border-(--signal) disabled:opacity-60"
          />
          <p className="text-[11px] text-(--text-faint)">Shows up in chat, round results, and the leaderboard.</p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={submitCreate}
          className="flex w-full items-center gap-3 rounded-[10px] border border-(--hairline) bg-(--surface) p-3.5 text-left transition-colors duration-150 hover:bg-(--surface-hover) disabled:cursor-wait disabled:opacity-60"
        >
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border border-(--hairline) bg-(--surface-strong) text-[17px]">
            🎮
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold text-(--text)">
              {creating ? "Creating room…" : "Create a room"}
            </span>
            <span className="block text-[11.5px] text-(--text-faint)">Host a new round, invite friends by code</span>
          </span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-(--text-faint)" aria-hidden="true">
            <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setJoinOpen((v) => !v)}
          className={`flex w-full items-center gap-3 rounded-[10px] border p-3.5 text-left transition-colors duration-150 hover:bg-(--surface-hover) ${
            joinOpen ? "border-(--signal) bg-(--signal)/10" : "border-(--hairline) bg-(--surface)"
          }`}
        >
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border border-(--hairline) bg-(--surface-strong) text-[17px]">
            🔑
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold text-(--text)">Join a room</span>
            <span className="block text-[11.5px] text-(--text-faint)">Enter a friend&apos;s room code</span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className={`shrink-0 text-(--text-faint) transition-transform duration-150 ${joinOpen ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {joinOpen && (
          <div className="flex gap-2 px-0.5">
            <label className="sr-only" htmlFor="room-code-input">
              Room code
            </label>
            <input
              id="room-code-input"
              type="text"
              value={code}
              disabled={busy}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitJoin()}
              maxLength={6}
              placeholder="e.g. AB12CD"
              autoComplete="off"
              className="h-[42px] flex-1 rounded-[7px] border border-(--hairline) bg-(--surface-strong) px-3 font-mono text-sm uppercase tracking-[0.06em] text-(--text) outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-(--text-faint) focus:border-(--signal) disabled:opacity-60"
            />
            <button
              type="button"
              disabled={busy}
              onClick={submitJoin}
              className="h-[42px] shrink-0 rounded-[7px] bg-(--signal) px-4 text-[13px] font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071] disabled:cursor-wait disabled:opacity-60"
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
        )}
        {error && <p className="px-0.5 text-xs text-(--miss)">{error}</p>}
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { MultiplayerPlayer } from "@/data/multiplayer-players";

export type ChatMessage =
  | { id: string; kind: "system"; text: string }
  | { id: string; kind: "msg"; player: MultiplayerPlayer; text: string };

type Props = {
  title: string;
  onlineCount: number;
  messages: ChatMessage[];
  onSend: (text: string) => void;
};

export function RoomChat({ title, onlineCount, messages, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages.length]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex flex-col rounded-[14px] border border-(--hairline) bg-(--surface)">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">
          <span className="h-1.5 w-1.5 rounded-full bg-(--miss) shadow-[0_0_0_3px_rgba(177,83,73,0.25)]" aria-hidden="true" />
          {title}
        </span>
        <span className="font-mono text-[11px] text-(--text-faint)">{onlineCount} online</span>
      </div>

      <div ref={bodyRef} className="flex max-h-[300px] min-h-[180px] flex-col gap-2 overflow-y-auto px-3.5 py-3">
        {messages.map((m) =>
          m.kind === "system" ? (
            <div key={m.id} className="self-center text-center text-[11px] italic text-(--text-faint)">
              <span dangerouslySetInnerHTML={{ __html: m.text }} />
            </div>
          ) : (
            <div
              key={m.id}
              className={`flex max-w-[88%] gap-2 ${m.player.isYou ? "flex-row-reverse self-end" : ""}`}
            >
              <span
                className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: m.player.color, color: m.player.isYou ? "var(--signal-ink)" : "#fff" }}
              >
                {m.player.initial}
              </span>
              <div className={`flex flex-col gap-0.5 ${m.player.isYou ? "items-end" : ""}`}>
                <span className="font-mono text-[10px] font-bold text-(--text-faint)">
                  {m.player.isYou ? "You" : m.player.name}
                </span>
                <span
                  className="rounded-[10px] px-2.5 py-1.5 text-[12.5px] text-(--text)"
                  style={{ background: m.player.isYou ? "color-mix(in srgb, var(--signal) 24%, var(--surface-hover))" : "var(--surface-hover)" }}
                >
                  {m.text}
                </span>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="flex gap-2 border-t border-(--hairline) px-3 py-2.5">
        <label className="sr-only" htmlFor="room-chat-input">
          Chat message
        </label>
        <input
          id="room-chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Say something…"
          autoComplete="off"
          className="h-[38px] flex-1 rounded-full border border-(--hairline) bg-(--surface-strong) px-3.5 text-[12.5px] text-(--text) outline-none placeholder:text-(--text-faint) focus:border-(--signal)"
        />
        <button
          type="button"
          onClick={submit}
          aria-label="Send message"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-(--signal) text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
        >
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M2 10L18 2L13 18L9.5 11.5L2 10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

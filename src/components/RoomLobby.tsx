"use client";

import { useEffect, useRef, useState } from "react";
import { RoomChat, type ChatMessage } from "@/components/RoomChat";
import { toPlayerView, type PlayerView } from "@/lib/multiplayer/player-view";
import { escapeHtml } from "@/lib/text/escape-html";
import type { DecadeFilter } from "@/lib/game/decade-filter";
import type { UseMultiplayerRoomResult } from "@/hooks/useMultiplayerRoom";

const ERA_OPTIONS: { value: DecadeFilter | null; label: string; hint: string }[] = [
  { value: null, label: "All eras", hint: "Every song in the catalog" },
  { value: "NINETIES", label: "Old", hint: "1960 – 1999" },
  { value: "TWO_THOUSANDS", label: "New", hint: "2000 – now" },
];

type Props = {
  mp: UseMultiplayerRoomResult;
  roomCode: string;
  onLeave: () => void;
};

let msgSeq = 0;
function nextId() {
  msgSeq += 1;
  return `m${msgSeq}`;
}

export function RoomLobby({ mp, roomCode, onLeave }: Props) {
  const { phase, room, players, myPlayerId, error, chatMessages, markReady, startGame, sendChat } = mp;

  const myPlayer = players.find((p) => p.playerId === myPlayerId);
  const isHost = myPlayer?.isHost ?? false;
  const views = players.map((p) => toPlayerView(p, myPlayerId));
  const [era, setEra] = useState<DecadeFilter | null>(null);

  // Player-joined/left system lines, derived by diffing the roster the server
  // hands us — no protocol change needed just to narrate arrivals in the chat.
  const [systemLines, setSystemLines] = useState<{ id: string; at: number; text: string }[]>([]);
  const knownIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(players.map((p) => p.playerId));
    if (knownIdsRef.current === null) {
      knownIdsRef.current = ids;
      return;
    }
    const prev = knownIdsRef.current;
    const arrived = players.filter((p) => !prev.has(p.playerId));
    knownIdsRef.current = ids;
    if (arrived.length === 0) return;
    setSystemLines((lines) => [
      ...lines,
      ...arrived.map((p) => ({ id: nextId(), at: Date.now(), text: `<b>${escapeHtml(p.displayName)}</b> joined the room` })),
    ]);
  }, [players]);

  const messages: ChatMessage[] = [
    { id: "welcome", kind: "system" as const, text: `Room <b>${roomCode}</b> — share the code to invite friends.` },
    ...systemLines.map((l) => ({ id: l.id, kind: "system" as const, text: l.text })),
    ...chatMessages.map((m) => {
      if (m.kind === "system") {
        return {
          id: m.id,
          kind: "system" as const,
          text: m.text,
        };
      }
      return {
        id: m.id,
        kind: "msg" as const,
        player: toPlayerView(
          { playerId: m.playerId || "", displayName: m.displayName || "Unknown", avatarUrl: null, status: "WAITING", seatIndex: 0, score: 0, roundsSolved: 0, isHost: false, isWinner: false },
          myPlayerId
        ),
        text: m.text,
      };
    }),
  ].sort((a, b) => (a.id === "welcome" ? -1 : b.id === "welcome" ? 1 : 0));

  if (phase === "connecting" || !room) {
    return (
      <LobbyShell onLeave={onLeave} subtitle="Connecting…">
        <div className="flex flex-1 items-center justify-center rounded-[14px] border border-(--hairline) bg-(--surface) p-10">
          <p className="text-sm text-(--text-faint)">Connecting to room {roomCode}…</p>
        </div>
      </LobbyShell>
    );
  }

  if (phase === "error") {
    return (
      <LobbyShell onLeave={onLeave} subtitle="Couldn't join">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[14px] border border-(--miss)/40 bg-(--surface) p-10 text-center">
          <p className="text-sm font-semibold text-(--miss)">{error ?? "Something went wrong."}</p>
          <button
            type="button"
            onClick={onLeave}
            className="h-10 rounded-[7px] border border-(--hairline) px-4 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover)"
          >
            Back
          </button>
        </div>
      </LobbyShell>
    );
  }

  if (phase === "starting") {
    return (
      <LobbyShell onLeave={onLeave} subtitle="Starting…">
        <div className="flex flex-1 items-center justify-center rounded-[14px] border border-(--hairline) bg-(--surface) p-10">
          <p className="text-sm text-(--text-faint)">Game starting…</p>
        </div>
      </LobbyShell>
    );
  }

  const emptySlots = Math.max(0, room.maxPlayers - views.length);

  return (
    <LobbyShell onLeave={onLeave} subtitle="Lobby · waiting to start">
      <div className="mt-5 flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-[1fr_340px] min-[900px]:items-start min-[900px]:gap-5">
        <div className="flex flex-col gap-4.5 rounded-[14px] border border-(--hairline) bg-(--surface) p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RoomCodeChip code={roomCode} />
            <span className="rounded-full border border-(--hairline) bg-(--surface-strong) px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-(--text-dim)">
              {isHost ? "Host" : "Guest"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">Players</span>
              <span className="font-mono text-xs tabular-nums text-(--text-dim)">
                {views.length} / {room.maxPlayers} · {room.totalRounds} rounds
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.round((views.length / room.maxPlayers) * 100))}%`,
                  background: "var(--signal)",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3">
            {views.map((p, i) => (
              <PlayerSlot key={p.id} player={p} pop={i === views.length - 1} />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <EmptySlot key={`empty-${i}`} />
            ))}
          </div>

          {isHost && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Era</span>
              <div className="flex flex-wrap gap-1.5">
                {ERA_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setEra(opt.value)}
                    title={opt.hint}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                      era === opt.value
                        ? "border-(--signal) bg-(--signal)/14 text-(--text)"
                        : "border-(--hairline) bg-(--surface-strong) text-(--text-dim) hover:bg-(--surface-hover)"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            {isHost ? (
              <button
                type="button"
                onClick={() => startGame(era)}
                className="h-11 min-w-[160px] flex-1 rounded-[7px] bg-(--signal) text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
              >
                {views.length > 1 ? "Start round" : "Start round (solo)"}
              </button>
            ) : (
              <button
                type="button"
                onClick={markReady}
                className={`h-11 min-w-[160px] flex-1 rounded-[7px] text-sm font-bold transition-colors duration-200 ${
                  myPlayer?.status === "READY"
                    ? "border border-(--success)/45 bg-(--success)/14 text-(--success)"
                    : "bg-(--signal) text-(--signal-ink) hover:bg-[#ffd071]"
                }`}
              >
                {myPlayer?.status === "READY" ? "Ready ✓" : "Ready up"}
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className="h-11 rounded-[7px] border border-(--hairline) px-4 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover)"
            >
              Leave room
            </button>
          </div>
          {error && <p className="text-xs text-(--miss)">{error}</p>}
          {!isHost && (
            <p className="rounded-[9px] border border-dashed border-(--hairline) bg-(--surface-strong) p-3 text-center text-xs text-(--text-faint)">
              The host will start the round once enough players have joined.
            </p>
          )}
        </div>

        <RoomChat title="Lobby chat" onlineCount={views.length} messages={messages} onSend={sendChat} />
      </div>
    </LobbyShell>
  );
}

function LobbyShell({ onLeave, subtitle, children }: { onLeave: () => void; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto border-t border-(--hairline) bg-(--bg) text-(--text)">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 pb-12 pt-5 sm:px-6 sm:pb-16 sm:pt-8">
        <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-(--hairline) pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-1.5 bg-(--signal)" aria-hidden="true" />
              <p className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-none tracking-[0.04em] text-(--text)">
                SARGAM
              </p>
            </div>
            <p className="mt-1.5 truncate pl-4 font-mono text-[9px] uppercase tracking-[0.18em] text-(--text-faint)">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="flex h-10 items-center gap-2 rounded-full border border-(--miss)/45 bg-(--surface) px-3 text-sm font-semibold text-(--miss) transition-colors duration-200 hover:bg-(--miss)/12"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M13 4H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7M9 10h8m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Leave room</span>
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function RoomCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1100);
      }}
      className="relative flex h-[38px] items-center gap-2 rounded-[9px] border border-dashed border-(--hairline) bg-(--surface-strong) px-3"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Room</span>
      <span className="font-mono text-sm font-bold tracking-[0.08em] text-(--text)">{code}</span>
      <span
        className={`pointer-events-none absolute left-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-(--signal-ink) px-2 py-1 font-mono text-[10px] font-bold text-(--signal) transition-opacity duration-200 ${
          copied ? "opacity-100" : "opacity-0"
        }`}
      >
        Copied
      </span>
    </button>
  );
}

function PlayerSlot({ player, pop }: { player: PlayerView; pop: boolean }) {
  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 rounded-xl border border-(--hairline) bg-(--surface-strong) p-3 ${
        pop ? "animate-[pop-in_0.4s_cubic-bezier(0.16,1,0.3,1)]" : ""
      }`}
    >
      {player.isHost && <span className="absolute left-0.5 top-0.5 text-xs">👑</span>}
      <span
        className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-[15px] font-bold text-white"
        style={{
          background: player.isYou ? "var(--signal)" : player.color,
          color: player.isYou ? "var(--signal-ink)" : "#fff",
          border: `2px solid ${player.isYou ? "var(--signal)" : player.color}`,
        }}
      >
        {player.initial}
      </span>
      {player.status === "READY" && (
        <span className="absolute bottom-5 right-2 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-(--surface-strong) bg-(--success) text-[9px] text-white">
          ✓
        </span>
      )}
      <span className="text-center text-[11.5px] font-semibold">{player.isYou ? "You" : player.name}</span>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-(--hairline) p-3 opacity-55">
      <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-dashed border-(--hairline) text-[16px] text-(--text-faint)">
        +
      </span>
      <span className="text-center text-[11.5px] text-(--text-faint)">Open</span>
    </div>
  );
}

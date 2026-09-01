"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { MultiplayerPickerModal } from "@/components/MultiplayerPickerModal";
import { RoomLobby } from "@/components/RoomLobby";
import { LiveMultiplayerRound } from "@/components/LiveMultiplayerRound";
import { useMultiplayerRoom } from "@/hooks/useMultiplayerRoom";
import type { CurrentUser } from "@/lib/get-current-user";

type View = "closed" | "modal" | "room";

type Props = {
  gameSlug: string;
  tagline: string | null;
  revealLadder: number[];
  maxAttempts: number;
  user: CurrentUser;
};

type ApiEnvelope<T> = { data?: T; error?: { message: string } };

async function postJson<T>(url: string, body?: unknown): Promise<ApiEnvelope<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    return { error: { message: "Network error — check your connection." } };
  }
}

// Owns the whole multiplayer session — one socket connection (via
// useMultiplayerRoom), lifted here rather than into RoomLobby/LiveMultiplayerRound
// individually, so switching between the lobby and the live round never tears
// down and reconnects the socket mid-game. Which of those two renders is driven
// entirely by `mp.phase`, which the server sets via room:state/round:start/etc.
export function MultiplayerEntry({ gameSlug, tagline, revealLadder, maxAttempts, user }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("closed");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const mp = useMultiplayerRoom(roomCode, playerId);

  const handleCreate = useCallback(async (): Promise<string | null> => {
    const body = await postJson<{ code: string; roomId: string; playerId: string }>(
      "/api/multiplayer/rooms",
      { gameSlug, totalRounds: 5, maxPlayers: 5 },
    );
    if (!body.data) return body.error?.message ?? "Failed to create room.";
    router.push(`/multiplayer/room/${body.data.code}`);
    return null;
  }, [gameSlug, router]);

  const handleJoin = useCallback(async (code: string): Promise<string | null> => {
    const body = await postJson<{ code: string; alreadyJoined: boolean; playerId: string }>(
      `/api/multiplayer/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`,
    );
    if (!body.data) return body.error?.message ?? "Failed to join room.";
    router.push(`/multiplayer/room/${body.data.code}`);
    return null;
  }, [router]);

  const handleLeave = useCallback(() => {
    setView("closed");
    setRoomCode(null);
    setPlayerId(null);
  }, []);

  const inRoom = view === "room" && roomCode !== null;
  const isLive = mp.phase === "playing" || mp.phase === "round_results" || mp.phase === "game_end";

  return (
    <>
      <button
        type="button"
        onClick={() => setView("modal")}
        className="relative flex h-10 items-center gap-2 rounded-full border border-transparent bg-(--signal) px-3 text-sm font-semibold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
        aria-label="Multiplayer"
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="6.5" cy="7" r="2.3" />
          <circle cx="14" cy="7" r="2.3" />
          <path d="M2.5 16c.5-2.6 2.1-4 4-4s3.5 1.4 4 4M10.5 16c.4-2.2 1.8-3.4 3.5-3.4s3.1 1.2 3.5 3.4" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Multiplayer</span>
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-(--miss) px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.05em] text-white">
          New
        </span>
      </button>

      {view === "modal" && (
        <MultiplayerPickerModal onClose={() => setView("closed")} onCreate={handleCreate} onJoin={handleJoin} />
      )}

      {inRoom && !isLive && <RoomLobby mp={mp} roomCode={roomCode!} onLeave={handleLeave} />}

      {inRoom && isLive && (
        <LiveMultiplayerRound
          mp={mp}
          roomCode={roomCode!}
          gameSlug={gameSlug}
          tagline={tagline}
          revealLadder={revealLadder}
          maxAttempts={maxAttempts}
          user={user}
          onLeave={handleLeave}
        />
      )}
    </>
  );
}

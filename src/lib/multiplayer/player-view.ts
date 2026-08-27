import { THEMES } from "@/data/themes";
import type { RoomPlayerInfo } from "@/lib/multiplayer/types";

/// Presentation-only view of a real RoomPlayerInfo, for components that were
/// originally built against the mock MultiplayerPlayer shape (id/name/initial/
/// color/isYou). RoomPlayerInfo carries no color of its own, so one is derived
/// deterministically from seatIndex against the app's existing theme palette —
/// every player in a room gets a stable, distinct color without a server change.
export type PlayerView = {
  id: string;
  name: string;
  initial: string;
  color: string;
  isYou: boolean;
  isHost: boolean;
  status: RoomPlayerInfo["status"];
  score: number;
  roundsSolved: number;
};

const YOU_COLOR = "var(--signal)";

export function seatColor(seatIndex: number): string {
  return THEMES[seatIndex % THEMES.length]!.from;
}

export function toPlayerView(p: RoomPlayerInfo, myPlayerId: string | null): PlayerView {
  const isYou = p.playerId === myPlayerId;
  const name = p.displayName || `Player ${p.seatIndex + 1}`;
  return {
    id: p.playerId,
    name,
    initial: name.trim().charAt(0).toUpperCase() || "?",
    color: isYou ? YOU_COLOR : seatColor(p.seatIndex),
    isYou,
    isHost: p.isHost,
    status: p.status,
    score: p.score,
    roundsSolved: p.roundsSolved,
  };
}

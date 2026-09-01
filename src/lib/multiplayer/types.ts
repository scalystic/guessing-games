// Shared types for the multiplayer WebSocket protocol.
// Used by both the server (socket-handler) and client (useMultiplayerRoom hook).

import type { DecadeFilter } from '@/lib/game/decade-filter'

export type RoomPlayerInfo = {
  playerId: string
  displayName: string
  avatarUrl: string | null
  status: 'WAITING' | 'READY' | 'PLAYING' | 'DISCONNECTED' | 'LEFT'
  seatIndex: number
  score: number
  roundsSolved: number
  isHost: boolean
  isWinner: boolean
}

export type RoomInfo = {
  code: string
  gameId: string
  gameSlug: string
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  hostPlayerId: string
  maxPlayers: number
  totalRounds: number
  currentRound: number
}

export type RoundPlayerResult = {
  playerId: string
  displayName: string
  outcome: 'SOLVED' | 'FAILED' | 'DISCONNECTED'
  stageReached: number
  attemptsUsed: number
  points: number
  solveDurationMs: number | null
}

export type RoundResults = {
  roundIndex: number
  puzzle: {
    title: string
    artist: string
    album: string | null
    releaseYear: number | null
  }
  playerResults: RoundPlayerResult[]
  /// ISO timestamp of when `round:start` (or `game:end`) fires for this
  /// result — lets the client render a live countdown instead of guessing at
  /// the server's internal delay.
  nextRoundAt: string
}

export type FinalRanking = {
  rank: number
  playerId: string
  displayName: string
  score: number
  roundsSolved: number
  isWinner: boolean
}

export type ChatMessageData = {
  id: string
  playerId?: string
  displayName?: string
  text: string
  at: number
  kind?: 'system' | 'msg'
}

// ---- Server → Client events ----

export type ServerToClientEvents = {
  'room:state': (data: { room: RoomInfo; players: RoomPlayerInfo[] }) => void
  'room:error': (data: { message: string }) => void
  'player:credentials': (data: { runId: string; runToken: string }) => void
  'game:started': (data: { totalRounds: number; roundIndex: number }) => void
  /// `deadline` is an ISO timestamp of when this round's 60s budget runs out
  /// (the same clock the server enforces via ROUND_TIMEOUT_MS) — the client
  /// renders a countdown from it rather than assuming a duration.
  'round:start': (data: { roundIndex: number; totalRounds: number; deadline: string }) => void
  'round:progress': (data: { playerId: string; displayName: string; done: boolean; outcome: 'SOLVED' | 'FAILED' | null; points: number | null }) => void
  'round:results': (data: RoundResults) => void
  'game:end': (data: { rankings: FinalRanking[] }) => void
  'room:chat': (data: ChatMessageData) => void
}

// ---- Client → Server events ----

export type ClientToServerEvents = {
  'room:join': (data: { code: string; playerId?: string }, callback: (ok: boolean, error?: string) => void) => void
  'room:ready': (data: { code: string }) => void
  /// decadeFilter is the host's choice, made once right before starting —
  /// null/omitted means every era, same "no filter" meaning solo play uses.
  'room:start': (data: { code: string; decadeFilter?: DecadeFilter | null }) => void
  /// Host-only: restarts a COMPLETED room with fresh puzzles and every
  /// player's score/rounds reset to zero — same room and players, round 1
  /// again.
  'room:rematch': (data: { code: string }) => void
  'round:done': (data: { code: string; roundIndex: number; outcome: 'SOLVED' | 'FAILED' }) => void
  'room:chat': (data: { code: string; text: string }) => void
}

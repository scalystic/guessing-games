// Shared types for the multiplayer WebSocket protocol.
// Used by both the server (socket-handler) and client (useMultiplayerRoom hook).

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
}

export type FinalRanking = {
  rank: number
  playerId: string
  displayName: string
  score: number
  roundsSolved: number
  isWinner: boolean
}

// ---- Server → Client events ----

export type ServerToClientEvents = {
  'room:state': (data: { room: RoomInfo; players: RoomPlayerInfo[] }) => void
  'room:error': (data: { message: string }) => void
  'player:credentials': (data: { runId: string; runToken: string }) => void
  'game:started': (data: { totalRounds: number; roundIndex: number }) => void
  'round:start': (data: { roundIndex: number; totalRounds: number }) => void
  'round:progress': (data: { playerId: string; displayName: string; done: boolean; outcome: 'SOLVED' | 'FAILED' | null }) => void
  'round:results': (data: RoundResults) => void
  'game:end': (data: { rankings: FinalRanking[] }) => void
}

// ---- Client → Server events ----

export type ClientToServerEvents = {
  'room:join': (data: { code: string; playerId?: string }, callback: (ok: boolean, error?: string) => void) => void
  'room:ready': (data: { code: string }) => void
  'room:start': (data: { code: string }) => void
  'round:done': (data: { code: string; roundIndex: number; outcome: 'SOLVED' | 'FAILED' }) => void
}

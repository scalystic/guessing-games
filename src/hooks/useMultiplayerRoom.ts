'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents, RoomInfo, RoomPlayerInfo, RoundResults, FinalRanking } from '@/lib/multiplayer/types'

export type MultiplayerPhase = 'connecting' | 'lobby' | 'starting' | 'playing' | 'round_results' | 'game_end' | 'error'

export type UseMultiplayerRoomResult = {
  phase: MultiplayerPhase
  room: RoomInfo | null
  players: RoomPlayerInfo[]
  myPlayerId: string | null
  myRun: { runId: string; runToken: string } | null
  roundResults: RoundResults | null
  finalRankings: FinalRanking[]
  roundProgress: Map<string, { done: boolean; outcome: 'SOLVED' | 'FAILED' | null }>
  error: string | null
  markReady: () => void
  startGame: () => void
  notifyRoundDone: (roundIndex: number, outcome: 'SOLVED' | 'FAILED') => void
}

export function useMultiplayerRoom(code: string, playerId: string | null): UseMultiplayerRoomResult {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const [phase, setPhase] = useState<MultiplayerPhase>('connecting')
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [players, setPlayers] = useState<RoomPlayerInfo[]>([])
  const [myRun, setMyRun] = useState<{ runId: string; runToken: string } | null>(null)
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([])
  const [roundProgress, setRoundProgress] = useState<Map<string, { done: boolean; outcome: 'SOLVED' | 'FAILED' | null }>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!playerId) return

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      path: '/ws/socket.io',
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('room:join', { code, playerId }, (ok, err) => {
        if (!ok) {
          setError(err ?? 'Failed to join room')
          setPhase('error')
        }
      })
    })

    socket.on('room:state', ({ room: r, players: p }) => {
      setRoom(r)
      setPlayers(p)
      if (r.status === 'WAITING') {
        setPhase('lobby')
      } else if (r.status === 'IN_PROGRESS') {
        setPhase('playing')
      } else if (r.status === 'COMPLETED') {
        setPhase('game_end')
      }
    })

    socket.on('room:error', ({ message }) => {
      setError(message)
    })

    socket.on('player:credentials', (creds) => {
      setMyRun(creds)
    })

    socket.on('game:started', () => {
      setPhase('starting')
      setRoundResults(null)
      setRoundProgress(new Map())
    })

    socket.on('round:start', () => {
      setPhase('playing')
      setRoundResults(null)
      setRoundProgress(new Map())
    })

    socket.on('round:progress', ({ playerId: pid, done, outcome }) => {
      setRoundProgress((prev) => {
        const next = new Map(prev)
        next.set(pid, { done, outcome })
        return next
      })
    })

    socket.on('round:results', (results) => {
      setRoundResults(results)
      setPhase('round_results')
    })

    socket.on('game:end', ({ rankings }) => {
      setFinalRankings(rankings)
      setPhase('game_end')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [code, playerId])

  const markReady = useCallback(() => {
    socketRef.current?.emit('room:ready', { code })
  }, [code])

  const startGame = useCallback(() => {
    socketRef.current?.emit('room:start', { code })
  }, [code])

  const notifyRoundDone = useCallback((roundIndex: number, outcome: 'SOLVED' | 'FAILED') => {
    socketRef.current?.emit('round:done', { code, roundIndex, outcome })
  }, [code])

  return {
    phase,
    room,
    players,
    myPlayerId: playerId,
    myRun,
    roundResults,
    finalRankings,
    roundProgress,
    error,
    markReady,
    startGame,
    notifyRoundDone,
  }
}

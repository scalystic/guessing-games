'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents, RoomInfo, RoomPlayerInfo, RoundResults, FinalRanking, ChatMessageData } from '@/lib/multiplayer/types'
import type { DecadeFilter } from '@/lib/game/decade-filter'

export type MultiplayerPhase = 'connecting' | 'lobby' | 'starting' | 'playing' | 'round_results' | 'game_end' | 'error'

export type UseMultiplayerRoomResult = {
  phase: MultiplayerPhase
  room: RoomInfo | null
  players: RoomPlayerInfo[]
  myPlayerId: string | null
  myRun: { runId: string; runToken: string } | null
  roundResults: RoundResults | null
  finalRankings: FinalRanking[]
  roundProgress: Map<string, { displayName: string; done: boolean; outcome: 'SOLVED' | 'FAILED' | null; points: number | null }>
  chatMessages: ChatMessageData[]
  error: string | null
  markReady: () => void
  startGame: (decadeFilter?: DecadeFilter | null) => void
  notifyRoundDone: (roundIndex: number, outcome: 'SOLVED' | 'FAILED') => void
  sendChat: (text: string) => void
}

export function useMultiplayerRoom(code: string | null, playerId: string | null): UseMultiplayerRoomResult {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const [phase, setPhase] = useState<MultiplayerPhase>('connecting')
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [players, setPlayers] = useState<RoomPlayerInfo[]>([])
  const [myRun, setMyRun] = useState<{ runId: string; runToken: string } | null>(null)
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([])
  const [roundProgress, setRoundProgress] = useState<Map<string, { displayName: string; done: boolean; outcome: 'SOLVED' | 'FAILED' | null; points: number | null }>>(new Map())
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!playerId || !code) return

    // Multiplayer's realtime layer runs as its own deployment (Railway),
    // separate from this app (Vercel) — see sargam-realtime-server. Same-origin
    // wouldn't reach it; the socket has to name that server explicitly. Falls
    // back to same-origin for local dev only when the env var is unset, which
    // matters if you're running the realtime server's code inline for some
    // reason — normally you'd run it as its own local process and still set
    // this to its URL (see that repo's README).
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, {
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

    socket.on('round:progress', ({ playerId: pid, displayName, done, outcome, points }) => {
      setRoundProgress((prev) => {
        const next = new Map(prev)
        next.set(pid, { displayName, done, outcome, points })
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

    socket.on('room:chat', (message) => {
      setChatMessages((prev) => [...prev, message])
    })

    return () => {
      socket.disconnect()
      socketRef.current = null

      // Runs when [code, playerId] changes (leaving one room and connecting
      // to another) as well as on unmount. Without this, the hook's state
      // survives leave-then-create-another-room — since it's the same
      // component instance throughout — and the new room's lobby would open
      // showing the last room's chat, round:progress dots, and rankings.
      setPhase('connecting')
      setRoom(null)
      setPlayers([])
      setMyRun(null)
      setRoundResults(null)
      setFinalRankings([])
      setRoundProgress(new Map())
      setChatMessages([])
      setError(null)
    }
  }, [code, playerId])

  const markReady = useCallback(() => {
    if (!code) return
    socketRef.current?.emit('room:ready', { code })
  }, [code])

  const startGame = useCallback((decadeFilter?: DecadeFilter | null) => {
    if (!code) return
    socketRef.current?.emit('room:start', { code, decadeFilter })
  }, [code])

  const notifyRoundDone = useCallback((roundIndex: number, outcome: 'SOLVED' | 'FAILED') => {
    if (!code) return
    socketRef.current?.emit('round:done', { code, roundIndex, outcome })
  }, [code])

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !code) return
    socketRef.current?.emit('room:chat', { code, text: trimmed })
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
    chatMessages,
    error,
    markReady,
    startGame,
    notifyRoundDone,
    sendChat,
  }
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMultiplayerRoom } from '@/hooks/useMultiplayerRoom'
import { RoomLobby } from '@/components/RoomLobby'
import { LiveMultiplayerRound } from '@/components/LiveMultiplayerRound'
import type { CurrentUser } from '@/lib/get-current-user'

type GameConfig = {
  slug: string
  tagline: string | null
  revealLadder: number[]
  maxAttempts: number
}

type Props = {
  code: string
  /// null when the visitor arrived with no session cookie — an invite link
  /// opened cold. A Server Component can't mint one (Next.js forbids cookie
  /// writes during render), so the join below is what produces the identity.
  playerId: string | null
  user: CurrentUser
}

export function RoomClient({ code, playerId: serverPlayerId, user }: Props) {
  const router = useRouter()
  const [playerId, setPlayerId] = useState(serverPlayerId)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)

  // Opening an invite link IS joining. Two things have to happen before the
  // socket will talk to this visitor, and neither can happen during render:
  //
  //   - They may have no identity at all. Minting a guest writes the session
  //     cookie, which Next.js only permits in a Route Handler.
  //   - The realtime server admits nobody who isn't already seated in the room
  //     ("You are not in this room"), and reaching the page by URL — unlike the
  //     join-by-code form — never seated them.
  //
  // This is the endpoint that form posts, and it does both. It's idempotent
  // (`alreadyJoined`), so a reload, the host arriving from room creation, and a
  // mid-game reconnect all pass straight through it.
  const joinedCode = useRef<string | null>(null)
  useEffect(() => {
    if (joinedCode.current === code) return
    joinedCode.current = code
    setJoinError(null)
    fetch(`/api/multiplayer/rooms/${encodeURIComponent(code)}/join`, { method: 'POST' })
      .then(async (r) => (await r.json().catch(() => null)) as { data?: { playerId?: string }; error?: { message?: string } } | null)
      .then((body) => {
        const id = body?.data?.playerId
        if (!id) throw new Error(body?.error?.message ?? 'Failed to join room')
        setPlayerId(id)
      })
      .catch((e: unknown) => setJoinError(e instanceof Error ? e.message : 'Failed to join room'))
  }, [code])

  // Held back until the join answers: the socket rejects a player who isn't
  // seated yet, and on a cold invite link serverPlayerId is null anyway.
  const mp = useMultiplayerRoom(code, joinError ? null : playerId)

  const gameSlug = mp.room?.gameSlug
  useEffect(() => {
    if (!gameSlug || gameConfig) return
    fetch(`/api/games/${gameSlug}`)
      .then((r) => r.json())
      .then((body) => {
        const g = body?.data ?? body
        if (g?.revealLadder) {
          setGameConfig({
            slug: g.slug,
            tagline: g.tagline ?? null,
            revealLadder: g.revealLadder,
            maxAttempts: g.maxAttempts,
          })
        }
      })
      .catch(() => {})
  }, [gameSlug, gameConfig])

  function handleLeave() {
    router.push('/')
  }

  // Without this the lobby would sit on "Connecting…" forever when the join
  // fails ("Room is full", "This game has already started"), since the socket
  // is never given a playerId to connect with.
  const view = joinError
    ? { ...mp, phase: 'error' as const, error: joinError }
    : mp

  const isLive =
    mp.phase === 'playing' ||
    mp.phase === 'round_results' ||
    mp.phase === 'game_end'

  if (isLive && gameConfig) {
    return (
      <LiveMultiplayerRound
        mp={mp}
        roomCode={code}
        gameSlug={gameConfig.slug}
        tagline={gameConfig.tagline}
        revealLadder={gameConfig.revealLadder}
        maxAttempts={gameConfig.maxAttempts}
        user={user}
        onLeave={handleLeave}
      />
    )
  }

  return <RoomLobby mp={view} roomCode={code} onLeave={handleLeave} />
}

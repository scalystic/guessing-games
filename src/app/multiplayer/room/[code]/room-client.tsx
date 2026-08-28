'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMultiplayerRoom } from '@/hooks/useMultiplayerRoom'
import { RoomLobby } from '@/components/RoomLobby'
import { LiveMultiplayerRound } from '@/components/LiveMultiplayerRound'

type GameConfig = {
  slug: string
  tagline: string | null
  revealLadder: number[]
  maxAttempts: number
}

type Props = {
  code: string
  playerId: string
}

export function RoomClient({ code, playerId }: Props) {
  const router = useRouter()
  const mp = useMultiplayerRoom(code, playerId)
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)

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
        onLeave={handleLeave}
      />
    )
  }

  return <RoomLobby mp={mp} roomCode={code} onLeave={handleLeave} />
}

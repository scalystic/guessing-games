'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Game = {
  id: string
  slug: string
  name: string
  tagline: string | null
}

export default function MultiplayerPage() {
  const router = useRouter()
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)

  const [createSlug, setCreateSlug] = useState('')
  const [createRounds, setCreateRounds] = useState(5)
  const [createMaxPlayers, setCreateMaxPlayers] = useState(5)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    fetch('/api/games')
      .then((r) => r.json())
      .then((body) => {
        const list: Game[] = body?.data ?? []
        setGames(list.filter((g) => g))
        if (list[0]) setCreateSlug(list[0].slug)
      })
      .catch(() => {})
      .finally(() => setGamesLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createSlug || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/multiplayer/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: createSlug, totalRounds: createRounds, maxPlayers: createMaxPlayers }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCreateError(body?.error?.message ?? 'Failed to create room')
        return
      }
      router.push(`/multiplayer/room/${body.data.code}`)
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code || joining) return
    setJoining(true)
    setJoinError(null)
    try {
      const res = await fetch(`/api/multiplayer/rooms/${code}/join`, {
        method: 'POST',
      })
      const body = await res.json()
      if (!res.ok) {
        setJoinError(body?.error?.message ?? 'Failed to join room')
        return
      }
      router.push(`/multiplayer/room/${code}`)
    } catch {
      setJoinError('Network error')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-10 bg-white px-6 py-20 sm:px-16 dark:bg-black">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Multiplayer
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Play the same songs as your friends — up to 5 players per room.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-xl border border-black/[.08] p-6 dark:border-white/[.145]">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Create a room</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Game</label>
                {gamesLoading ? (
                  <div className="h-10 rounded-md bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                ) : (
                  <select
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value)}
                    className="h-10 rounded-md border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {games.map((g) => (
                      <option key={g.id} value={g.slug}>{g.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Rounds</label>
                  <select
                    value={createRounds}
                    onChange={(e) => setCreateRounds(Number(e.target.value))}
                    className="h-10 rounded-md border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Max players</label>
                  <select
                    value={createMaxPlayers}
                    onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}
                    className="h-10 rounded-md border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              {createError && (
                <p className="text-xs text-red-500">{createError}</p>
              )}
              <button
                type="submit"
                disabled={creating || gamesLoading || !createSlug}
                className="h-10 rounded-md bg-black px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
              >
                {creating ? 'Creating…' : 'Create room'}
              </button>
            </form>
          </section>

          <section className="flex flex-col gap-4 rounded-xl border border-black/[.08] p-6 dark:border-white/[.145]">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Join a room</h2>
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Room code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="h-10 rounded-md border border-black/[.08] bg-white px-3 font-mono text-sm uppercase tracking-widest text-black placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-400 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
              {joinError && (
                <p className="text-xs text-red-500">{joinError}</p>
              )}
              <button
                type="submit"
                disabled={joining || joinCode.trim().length < 6}
                className="h-10 rounded-md bg-black px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
              >
                {joining ? 'Joining…' : 'Join room'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}

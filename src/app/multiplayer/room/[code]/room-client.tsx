'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMultiplayerRoom } from '@/hooks/useMultiplayerRoom'
import { GuessAutocomplete } from '@/components/GuessAutocomplete'
import type { CatalogMatch } from '@/lib/api/runs'

function newKey() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

type Props = {
  code: string
  playerId: string
}

export function RoomClient({ code, playerId }: Props) {
  const {
    phase,
    room,
    players,
    myPlayerId,
    myRun,
    roundResults,
    finalRankings,
    roundProgress,
    error,
    markReady,
    startGame,
    notifyRoundDone,
  } = useMultiplayerRoom(code, playerId)

  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [roundDone, setRoundDone] = useState(false)
  const [pendingGuess, setPendingGuess] = useState(false)
  const [guessedPuzzleIds, setGuessedPuzzleIds] = useState<Set<string>>(new Set())
  const [roundIndex, setRoundIndex] = useState(1)
  const [stageReached, setStageReached] = useState(1)
  const maxAttempts = 6

  const objectUrlRef = useRef<string | null>(null)
  const generationRef = useRef(0)

  function releaseAudio() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  useEffect(() => releaseAudio, [])

  async function loadAudio(runId: string, token: string, generation: number) {
    setAudioLoading(true)
    try {
      const res = await fetch(`/api/runs/${runId}/audio`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      if (generation !== generationRef.current) return
      const blob = await res.blob()
      if (generation !== generationRef.current) return
      const url = URL.createObjectURL(blob)
      const stageHeader = res.headers.get('x-stage')
      if (stageHeader) setStageReached(Number(stageHeader))
      releaseAudio()
      objectUrlRef.current = url
      setAudioUrl(url)
    } catch {
    } finally {
      if (generation === generationRef.current) setAudioLoading(false)
    }
  }

  useEffect(() => {
    if (phase === 'playing' && myRun) {
      const generation = ++generationRef.current
      setRoundDone(false)
      setGuessedPuzzleIds(new Set())
      setStageReached(1)
      if (room) setRoundIndex(room.currentRound)
      void loadAudio(myRun.runId, myRun.runToken, generation)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, room?.currentRound])

  const handleGuess = useCallback(
    async (match: CatalogMatch) => {
      if (!myRun || roundDone || pendingGuess) return
      setPendingGuess(true)
      setGuessedPuzzleIds((prev) => new Set([...prev, match.puzzleId]))
      try {
        const res = await fetch(`/api/runs/${myRun.runId}/guess`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${myRun.runToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            guessedPuzzleId: match.puzzleId,
            rawInput: `${match.title} — ${match.artist}`,
            idempotencyKey: newKey(),
          }),
        })
        const body = await res.json()
        const result = body?.data
        if (!result) return

        setStageReached(result.stageReached)

        if (result.outcome === 'SOLVED' || result.outcome === 'FAILED') {
          setRoundDone(true)
          notifyRoundDone(roundIndex, result.outcome as 'SOLVED' | 'FAILED')
        } else {
          const generation = ++generationRef.current
          void loadAudio(myRun.runId, myRun.runToken, generation)
        }
      } catch {
      } finally {
        setPendingGuess(false)
      }
    },
    [myRun, roundDone, pendingGuess, roundIndex, notifyRoundDone],
  )

  const handleSkip = useCallback(async () => {
    if (!myRun || roundDone || pendingGuess) return
    setPendingGuess(true)
    try {
      const res = await fetch(`/api/runs/${myRun.runId}/skip`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${myRun.runToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idempotencyKey: newKey() }),
      })
      const body = await res.json()
      const result = body?.data
      if (!result) return

      setStageReached(result.stageReached)

      if (result.outcome === 'SOLVED' || result.outcome === 'FAILED') {
        setRoundDone(true)
        notifyRoundDone(roundIndex, result.outcome as 'SOLVED' | 'FAILED')
      } else {
        const generation = ++generationRef.current
        void loadAudio(myRun.runId, myRun.runToken, generation)
      }
    } catch {
    } finally {
      setPendingGuess(false)
    }
  }, [myRun, roundDone, pendingGuess, roundIndex, notifyRoundDone])

  const myPlayer = players.find((p) => p.playerId === myPlayerId)
  const isHost = myPlayer?.isHost ?? false

  if (phase === 'connecting') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-zinc-500 dark:text-zinc-400">Connecting to room {code}…</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="flex flex-col gap-3 text-center">
          <p className="text-lg font-semibold text-red-500">{error ?? 'Could not join room'}</p>
          <a href="/multiplayer" className="text-sm text-zinc-500 underline hover:text-black dark:hover:text-zinc-50">
            Back to multiplayer
          </a>
        </div>
      </div>
    )
  }

  if (phase === 'game_end') {
    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 bg-white px-6 py-16 sm:px-12 dark:bg-black">
          <header className="flex flex-col gap-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">Room {code}</p>
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">Game over</h1>
          </header>
          <div className="flex flex-col gap-2">
            {finalRankings.map((r) => (
              <div
                key={r.playerId}
                className={`flex items-center gap-4 rounded-xl px-4 py-3 ${r.isWinner ? 'bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-800' : 'border border-black/8 dark:border-white/[.145]'}`}
              >
                <span className="w-6 text-center font-mono text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  {r.rank}
                </span>
                <span className="flex-1 font-medium text-black dark:text-zinc-50">
                  {r.displayName}
                  {r.isWinner ? ' 🏆' : ''}
                </span>
                <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                  {r.score} pts · {r.roundsSolved} solved
                </span>
              </div>
            ))}
          </div>
          <a
            href="/multiplayer"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-black text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            Play again
          </a>
        </main>
      </div>
    )
  }

  if (phase === 'round_results' && roundResults) {
    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-1 flex-col gap-6 bg-white px-6 py-16 sm:px-12 dark:bg-black">
          <header className="flex flex-col gap-1">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">Round {roundResults.roundIndex} results</p>
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">{roundResults.puzzle.title}</h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              {roundResults.puzzle.artist}
              {roundResults.puzzle.album ? ` · ${roundResults.puzzle.album}` : ''}
              {roundResults.puzzle.releaseYear ? ` · ${roundResults.puzzle.releaseYear}` : ''}
            </p>
          </header>
          <div className="flex flex-col gap-2">
            {roundResults.playerResults.map((pr) => (
              <div key={pr.playerId} className="flex items-center gap-3 rounded-lg border border-black/8 px-4 py-3 dark:border-white/[.145]">
                <span className={`h-2 w-2 rounded-full ${pr.outcome === 'SOLVED' ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className="flex-1 text-sm font-medium text-black dark:text-zinc-50">{pr.displayName}</span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {pr.outcome === 'SOLVED' ? `+${pr.points} pts` : 'No points'}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {pr.attemptsUsed}/{maxAttempts} attempts
                </span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Next round starting soon…</p>
        </main>
      </div>
    )
  }

  if (phase === 'lobby') {
    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 bg-white px-6 py-16 sm:px-12 dark:bg-black">
          <header className="flex flex-col gap-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">Multiplayer lobby</p>
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">Room {code}</h1>
              {room && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {room.totalRounds} rounds · up to {room.maxPlayers} players
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Share the code <span className="font-mono font-semibold">{code}</span> with friends to invite them.
            </p>
          </header>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Players</p>
            {players.map((p) => (
              <div key={p.playerId} className="flex items-center gap-3 rounded-lg border border-black/8 px-4 py-3 dark:border-white/[.145]">
                <span className={`h-2 w-2 rounded-full ${p.status === 'READY' ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                <span className="flex-1 text-sm font-medium text-black dark:text-zinc-50">
                  {p.displayName}
                  {p.isHost ? ' (host)' : ''}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {p.status === 'READY' ? 'Ready' : 'Waiting'}
                </span>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            {!isHost && (
              <button
                onClick={markReady}
                className="flex-1 rounded-lg border border-black/8 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-black/4 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/6"
              >
                {myPlayer?.status === 'READY' ? 'Not ready' : 'Ready up'}
              </button>
            )}
            {isHost && (
              <button
                onClick={startGame}
                disabled={players.length < 1}
                className="flex-1 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
              >
                Start game
              </button>
            )}
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'starting') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-zinc-500 dark:text-zinc-400">Game starting…</p>
      </div>
    )
  }

  // playing phase
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-6 bg-white px-6 py-12 sm:px-12 dark:bg-black">
        <header className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Room {code} · Round {room?.currentRound ?? roundIndex}/{room?.totalRounds ?? '?'}
            </p>
          </div>
          <div className="flex gap-3">
            {players.map((p) => {
              const prog = roundProgress.get(p.playerId)
              return (
                <div key={p.playerId} title={p.displayName} className="flex flex-col items-center gap-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      prog?.done
                        ? prog.outcome === 'SOLVED'
                          ? 'bg-green-500'
                          : 'bg-red-400'
                        : 'bg-zinc-200 dark:bg-zinc-700'
                    }`}
                  />
                </div>
              )
            })}
          </div>
        </header>

        {audioUrl && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Stage {stageReached} clip
            </p>
            <audio
              key={audioUrl}
              src={audioUrl}
              controls
              autoPlay
              className="w-full"
            />
          </div>
        )}
        {audioLoading && !audioUrl && (
          <div className="flex h-16 items-center justify-center rounded-xl border border-black/8 dark:border-white/[.145]">
            <p className="text-sm text-zinc-400">Loading audio…</p>
          </div>
        )}

        {roundDone ? (
          <div className="rounded-xl border border-black/8 px-4 py-3 dark:border-white/[.145]">
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Waiting for other players to finish…
            </p>
          </div>
        ) : (
          <GuessAutocomplete
            gameSlug={room?.gameSlug ?? 'songless'}
            disabled={!myRun || roundDone || audioLoading}
            pendingAction={pendingGuess ? 'guess' : null}
            nextRevealMs={null}
            excludePuzzleIds={guessedPuzzleIds}
            onGuess={handleGuess}
            onSkip={handleSkip}
          />
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Players
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {players.map((p) => {
              const prog = roundProgress.get(p.playerId)
              return (
                <div
                  key={p.playerId}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    p.playerId === myPlayerId
                      ? 'border-black/20 bg-black/4 dark:border-white/20 dark:bg-white/4'
                      : 'border-black/8 dark:border-white/[.145]'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      prog?.done
                        ? prog.outcome === 'SOLVED'
                          ? 'bg-green-500'
                          : 'bg-red-400'
                        : 'bg-zinc-200 dark:bg-zinc-700'
                    }`}
                  />
                  <span className="truncate font-medium text-black dark:text-zinc-50">{p.displayName}</span>
                  <span className="ml-auto font-mono text-xs text-zinc-500 dark:text-zinc-400">{p.score}</span>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

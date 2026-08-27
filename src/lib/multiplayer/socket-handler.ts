import type { Server, Socket } from 'socket.io'
import { randomBytes, createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import type { ServerToClientEvents, ClientToServerEvents } from './types'

// In-memory tracking: roomCode → socket set and round completion state
type RoomMemory = {
  playerSockets: Map<string, string> // playerId → socketId
  socketPlayers: Map<string, string> // socketId → playerId
  roundDone: Set<string>             // playerIds who finished the current round
  roundIndex: number
  totalRounds: number
  playerRuns: Map<string, { runId: string; runToken: string }> // playerId → credentials
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'
}

const rooms = new Map<string, RoomMemory>()

function mintToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

async function selectRoomPuzzles(
  gameId: string,
  totalRounds: number,
  maxAttempts: number,
): Promise<string[]> {
  type Row = { id: string }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT p.id
    FROM "Puzzle" p
    JOIN "PuzzleAsset" a
      ON a."puzzleId" = p.id
     AND a.kind = 'AUDIO_CLIP'::"AssetKind"
    WHERE p."gameId" = ${gameId}
      AND p."isActive" = true
      AND p."isBlocked" = false
      AND coalesce(array_length(a."stageByteOffsets", 1), 0) >= ${maxAttempts}
    ORDER BY random()
    LIMIT ${totalRounds}
  `
  return rows.map((r) => r.id)
}

async function getRoomState(code: string) {
  return prisma.multiplayerRoom.findUnique({
    where: { code },
    include: {
      players: {
        include: { player: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { seatIndex: 'asc' },
      },
      game: { select: { id: true, slug: true, maxAttempts: true } },
    },
  })
}

async function broadcastRoomState(io: Server, code: string) {
  const room = await getRoomState(code)
  if (!room) return
  const mem = rooms.get(code)

  const players = room.players.map((p) => {
    const socketId = mem?.playerSockets.get(p.playerId)
    const isConnected = socketId ? mem?.socketPlayers.has(socketId) : false
    return {
      playerId: p.playerId,
      displayName: p.player.displayName ?? `Player ${p.seatIndex + 1}`,
      avatarUrl: p.player.avatarUrl,
      status: (isConnected ? p.status : 'DISCONNECTED') as RoomPlayerInfo['status'],
      seatIndex: p.seatIndex,
      score: p.score,
      roundsSolved: p.roundsSolved,
      isHost: p.playerId === room.hostPlayerId,
      isWinner: p.isWinner,
    }
  })

  io.to(code).emit('room:state', {
    room: {
      code: room.code,
      gameId: room.gameId,
      gameSlug: room.game.slug,
      status: room.status as 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
      hostPlayerId: room.hostPlayerId,
      maxPlayers: room.maxPlayers,
      totalRounds: room.totalRounds,
      currentRound: room.currentRound,
    },
    players,
  })
}

type RoomPlayerInfo = {
  status: 'WAITING' | 'READY' | 'PLAYING' | 'DISCONNECTED' | 'LEFT'
}

export function registerSocketHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    socket.on('room:join', async ({ code, playerId }: { code: string; playerId?: string }, callback) => {
      try {
        const room = await prisma.multiplayerRoom.findUnique({
          where: { code },
          include: { players: true, game: { select: { id: true, slug: true, maxAttempts: true } } },
        })

        if (!room) { callback(false, 'Room not found'); return }
        if (room.status === 'CANCELLED') { callback(false, 'Room was cancelled'); return }

        const myPlayerId = playerId
        if (!myPlayerId) { callback(false, 'playerId required'); return }

        const roomPlayer = room.players.find((p) => p.playerId === myPlayerId)
        if (!roomPlayer) { callback(false, 'You are not in this room'); return }

        let mem = rooms.get(code)
        if (!mem) {
          mem = {
            playerSockets: new Map(),
            socketPlayers: new Map(),
            roundDone: new Set(),
            roundIndex: room.currentRound,
            totalRounds: room.totalRounds,
            playerRuns: new Map(),
            status: room.status as 'WAITING' | 'IN_PROGRESS' | 'COMPLETED',
          }
          rooms.set(code, mem)
        }

        const oldSocketId = mem.playerSockets.get(myPlayerId)
        if (oldSocketId && oldSocketId !== socket.id) {
          mem.socketPlayers.delete(oldSocketId)
        }
        mem.playerSockets.set(myPlayerId, socket.id)
        mem.socketPlayers.set(socket.id, myPlayerId)

        socket.data.playerId = myPlayerId
        socket.data.roomCode = code
        socket.join(code)

        await prisma.multiplayerRoomPlayer.update({
          where: { roomId_playerId: { roomId: room.id, playerId: myPlayerId } },
          data: { status: room.status === 'IN_PROGRESS' ? 'PLAYING' : 'WAITING' },
        })

        callback(true)
        await broadcastRoomState(io, code)

        if (room.status === 'IN_PROGRESS') {
          const creds = mem.playerRuns.get(myPlayerId)
          if (creds) {
            socket.emit('player:credentials', creds)
            socket.emit('round:start', { roundIndex: room.currentRound, totalRounds: room.totalRounds })
          }
        }
      } catch (e) {
        console.error('[socket] room:join error', e)
        callback(false, 'Internal error')
      }
    })

    socket.on('room:ready', async ({ code }) => {
      const playerId = socket.data.playerId
      if (!playerId) return
      try {
        const room = await prisma.multiplayerRoom.findUnique({ where: { code } })
        if (!room || room.status !== 'WAITING') return

        const rp = await prisma.multiplayerRoomPlayer.findUnique({
          where: { roomId_playerId: { roomId: room.id, playerId } },
        })
        if (!rp) return

        const newStatus = rp.status === 'READY' ? 'WAITING' : 'READY'
        await prisma.multiplayerRoomPlayer.update({
          where: { roomId_playerId: { roomId: room.id, playerId } },
          data: { status: newStatus },
        })
        await broadcastRoomState(io, code)
      } catch (e) {
        console.error('[socket] room:ready error', e)
      }
    })

    socket.on('room:start', async ({ code }) => {
      const playerId = socket.data.playerId
      if (!playerId) return
      try {
        const room = await prisma.multiplayerRoom.findUnique({
          where: { code },
          include: {
            players: { include: { player: { select: { id: true, displayName: true } } } },
            game: { select: { id: true, slug: true, maxAttempts: true, scoringVersion: true, livesPerRun: true } },
          },
        })
        if (!room) return
        if (room.hostPlayerId !== playerId) { socket.emit('room:error', { message: 'Only the host can start the game' }); return }
        if (room.status !== 'WAITING') return
        if (room.players.length < 1) { socket.emit('room:error', { message: 'Need at least 1 player' }); return }

        const puzzleIds = await selectRoomPuzzles(room.gameId, room.totalRounds, room.game.maxAttempts)
        if (puzzleIds.length < room.totalRounds) {
          socket.emit('room:error', { message: 'Not enough puzzles in the catalog for this game' })
          return
        }

        await prisma.multiplayerRound.createMany({
          data: puzzleIds.map((puzzleId, i) => ({
            roomId: room.id,
            roundIndex: i + 1,
            puzzleId,
          })),
        })

        let mem = rooms.get(code)
        if (!mem) {
          mem = {
            playerSockets: new Map(),
            socketPlayers: new Map(),
            roundDone: new Set(),
            roundIndex: 1,
            totalRounds: room.totalRounds,
            playerRuns: new Map(),
            status: 'WAITING',
          }
          rooms.set(code, mem)
        }

        const TTL_MS = 3 * 60 * 60 * 1000

        for (const rp of room.players) {
          const { token, tokenHash } = mintToken()
          const run = await prisma.run.create({
            data: {
              gameId: room.gameId,
              playerId: rp.playerId,
              mode: 'MULTIPLAYER',
              seed: room.seed,
              status: 'IN_PROGRESS',
              currentRoundIndex: 1,
              livesRemaining: 99,
              maxRounds: room.totalRounds,
              scoringVersion: room.game.scoringVersion,
              isRanked: false,
              tokenHash,
              expiresAt: new Date(Date.now() + TTL_MS),
              multiplayerRoomId: room.id,
            },
          })

          await prisma.runRound.create({
            data: {
              runId: run.id,
              roundIndex: 1,
              puzzleId: puzzleIds[0]!,
            },
          })

          await prisma.multiplayerRoomPlayer.update({
            where: { roomId_playerId: { roomId: room.id, playerId: rp.playerId } },
            data: { runId: run.id, status: 'PLAYING' },
          })

          mem.playerRuns.set(rp.playerId, { runId: run.id, runToken: token })

          const playerSocketId = mem.playerSockets.get(rp.playerId)
          if (playerSocketId) {
            io.to(playerSocketId).emit('player:credentials', { runId: run.id, runToken: token })
          }
        }

        await prisma.multiplayerRoom.update({
          where: { id: room.id },
          data: { status: 'IN_PROGRESS', startsAt: new Date(), currentRound: 1 },
        })

        mem.status = 'IN_PROGRESS'
        mem.roundIndex = 1
        mem.roundDone.clear()

        io.to(code).emit('game:started', { totalRounds: room.totalRounds, roundIndex: 1 })
        io.to(code).emit('round:start', { roundIndex: 1, totalRounds: room.totalRounds })
      } catch (e) {
        console.error('[socket] room:start error', e)
        socket.emit('room:error', { message: 'Failed to start game' })
      }
    })

    socket.on('round:done', async ({ code, roundIndex, outcome }) => {
      const playerId = socket.data.playerId
      if (!playerId) return

      const mem = rooms.get(code)
      if (!mem || mem.status !== 'IN_PROGRESS') return
      if (roundIndex !== mem.roundIndex) return

      const room = await prisma.multiplayerRoom.findUnique({
        where: { code },
        include: { players: { include: { player: { select: { id: true, displayName: true } } } } },
      })
      if (!room) return

      const rp = room.players.find((p) => p.playerId === playerId)
      const displayName = rp?.player.displayName ?? 'Player'

      io.to(code).emit('round:progress', { playerId, displayName, done: true, outcome })
      mem.roundDone.add(playerId)

      const connectedPlayers = [...mem.playerSockets.keys()]
      const allDone = connectedPlayers.every((pid) => mem.roundDone.has(pid))

      if (allDone) {
        await resolveRound(io, code, room.id, roundIndex, room.totalRounds, mem)
      }
    })

    socket.on('disconnect', async () => {
      const playerId = socket.data.playerId
      const code = socket.data.roomCode
      if (!playerId || !code) return

      const mem = rooms.get(code)
      if (!mem) return

      mem.playerSockets.delete(playerId)
      mem.socketPlayers.delete(socket.id)

      try {
        const room = await prisma.multiplayerRoom.findUnique({
          where: { code },
          include: { players: true },
        })
        if (!room) return

        await prisma.multiplayerRoomPlayer.update({
          where: { roomId_playerId: { roomId: room.id, playerId } },
          data: { status: 'DISCONNECTED' },
        }).catch(() => {})

        if (mem.status === 'IN_PROGRESS') {
          mem.roundDone.add(playerId)
          const connectedPlayers = [...mem.playerSockets.keys()]
          const allDone = connectedPlayers.length === 0 || connectedPlayers.every((pid) => mem.roundDone.has(pid))
          if (allDone && connectedPlayers.length > 0) {
            await resolveRound(io, code, room.id, mem.roundIndex, room.totalRounds, mem)
          }
        }

        await broadcastRoomState(io, code)
      } catch (e) {
        console.error('[socket] disconnect error', e)
      }
    })
  })
}

async function resolveRound(
  io: Server,
  code: string,
  roomId: string,
  roundIndex: number,
  totalRounds: number,
  mem: RoomMemory,
) {
  const multiRound = await prisma.multiplayerRound.findUnique({
    where: { roomId_roundIndex: { roomId, roundIndex } },
    include: { puzzle: { include: { song: true } } },
  })

  if (!multiRound?.puzzle.song) return

  const room = await prisma.multiplayerRoom.findUnique({
    where: { id: roomId },
    include: {
      players: { include: { player: { select: { id: true, displayName: true } }, run: true } },
    },
  })
  if (!room) return

  const playerResults = []
  for (const rp of room.players) {
    if (!rp.runId) continue
    const runRound = await prisma.runRound.findUnique({
      where: { runId_roundIndex: { runId: rp.runId, roundIndex } },
    })
    if (!runRound) continue

    playerResults.push({
      playerId: rp.playerId,
      displayName: rp.player.displayName ?? `Player ${rp.seatIndex + 1}`,
      outcome: (runRound.outcome === 'PENDING' ? 'FAILED' : runRound.outcome) as 'SOLVED' | 'FAILED' | 'DISCONNECTED',
      stageReached: runRound.stageReached,
      attemptsUsed: runRound.attemptsUsed,
      points: runRound.points,
      solveDurationMs: runRound.solveDurationMs,
    })

    await prisma.multiplayerRoomPlayer.update({
      where: { roomId_playerId: { roomId, playerId: rp.playerId } },
      data: {
        score: { increment: runRound.points },
        roundsSolved: runRound.outcome === 'SOLVED' ? { increment: 1 } : undefined,
        totalRevealMs: { increment: 0 },
      },
    })
  }

  io.to(code).emit('round:results', {
    roundIndex,
    puzzle: {
      title: multiRound.puzzle.song.title,
      artist: multiRound.puzzle.song.artist,
      album: multiRound.puzzle.song.album ?? null,
      releaseYear: multiRound.puzzle.song.releaseYear ?? null,
    },
    playerResults,
  })

  setTimeout(() => {
    void (async () => {
      const nextRound = roundIndex + 1
      if (nextRound > totalRounds) {
        await endGame(io, code, roomId, mem)
      } else {
        mem.roundIndex = nextRound
        mem.roundDone.clear()

        await prisma.multiplayerRoom.update({
          where: { id: roomId },
          data: { currentRound: nextRound },
        })

        io.to(code).emit('round:start', { roundIndex: nextRound, totalRounds })
      }
    })()
  }, 5000)
}

async function endGame(io: Server, code: string, roomId: string, mem: RoomMemory) {
  const room = await prisma.multiplayerRoom.findUnique({
    where: { id: roomId },
    include: {
      players: {
        include: { player: { select: { id: true, displayName: true } } },
        orderBy: { score: 'desc' },
      },
    },
  })
  if (!room) return

  if (room.players.length > 0) {
    const winner = room.players[0]!
    await prisma.multiplayerRoomPlayer.update({
      where: { roomId_playerId: { roomId, playerId: winner.playerId } },
      data: { isWinner: true, finishedAt: new Date() },
    })

    for (const rp of room.players) {
      await prisma.playerGameStat.upsert({
        where: { playerId_gameId: { playerId: rp.playerId, gameId: room.gameId } },
        create: {
          playerId: rp.playerId,
          gameId: room.gameId,
          multiplayerRunsPlayed: 1,
          multiplayerWins: rp.playerId === winner.playerId ? 1 : 0,
        },
        update: {
          multiplayerRunsPlayed: { increment: 1 },
          multiplayerWins: rp.playerId === winner.playerId ? { increment: 1 } : undefined,
        },
      })

      if (rp.runId) {
        await prisma.run.update({
          where: { id: rp.runId },
          data: { status: 'COMPLETED', endedAt: new Date() },
        }).catch(() => {})
      }
    }
  }

  await prisma.multiplayerRoom.update({
    where: { id: roomId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  mem.status = 'COMPLETED'

  const rankings = room.players.map((rp, i) => ({
    rank: i + 1,
    playerId: rp.playerId,
    displayName: rp.player.displayName ?? `Player ${rp.seatIndex + 1}`,
    score: rp.score,
    roundsSolved: rp.roundsSolved,
    isWinner: i === 0,
  }))

  io.to(code).emit('game:end', { rankings })
}

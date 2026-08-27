import { prisma } from '@/lib/db'
import { jsonError, jsonOk } from '@/lib/api/response'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  ctx: RouteContext<'/api/multiplayer/rooms/[code]/join'>,
): Promise<Response> {
  const { code } = await ctx.params
  try {
    const session = await getSession()
    if (!session) return jsonError(401, 'unauthorized', 'Login required to join a room')

    const room = await prisma.multiplayerRoom.findUnique({
      where: { code: code.toUpperCase() },
      include: { players: true },
    })

    if (!room) return jsonError(404, 'not_found', 'Room not found')
    if (room.status !== 'WAITING') return jsonError(409, 'room_started', 'This game has already started')
    if (room.players.length >= room.maxPlayers) return jsonError(409, 'room_full', 'Room is full')

    const existing = room.players.find((p) => p.playerId === session.playerId)
    if (existing) {
      return jsonOk({ code: room.code, alreadyJoined: true })
    }

    const seatIndex = room.players.length
    await prisma.multiplayerRoomPlayer.create({
      data: {
        roomId: room.id,
        playerId: session.playerId,
        seatIndex,
        status: 'WAITING',
      },
    })

    return jsonOk({ code: room.code, alreadyJoined: false })
  } catch (e) {
    console.error('[api] join room error', e)
    return jsonError(500, 'internal_error', 'Failed to join room')
  }
}

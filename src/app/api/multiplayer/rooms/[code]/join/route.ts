import { prisma } from '@/lib/db'
import { jsonError, jsonOk } from '@/lib/api/response'
import { ensurePlayer } from '@/lib/guest'

export const dynamic = 'force-dynamic'

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? null
}

export async function POST(
  request: Request,
  ctx: RouteContext<'/api/multiplayer/rooms/[code]/join'>,
): Promise<Response> {
  const { code } = await ctx.params
  try {
    // Same reasoning as room creation: a guest can join without signing up
    // first, exactly like they can start a solo run.
    const { playerId } = await ensurePlayer(clientIp(request))

    const room = await prisma.multiplayerRoom.findUnique({
      where: { code: code.toUpperCase() },
      include: { players: true },
    })

    if (!room) return jsonError(404, 'not_found', 'Room not found')

    const existing = room.players.find((p) => p.playerId === playerId)
    if (existing) {
      return jsonOk({ code: room.code, alreadyJoined: true, playerId })
    }

    if (room.status !== 'WAITING') return jsonError(409, 'room_started', 'This game has already started')
    if (room.players.length >= room.maxPlayers) return jsonError(409, 'room_full', 'Room is full')

    const seatIndex = room.players.length
    await prisma.multiplayerRoomPlayer.create({
      data: {
        roomId: room.id,
        playerId,
        seatIndex,
        status: 'WAITING',
      },
    })

    return jsonOk({ code: room.code, alreadyJoined: false, playerId })
  } catch (e) {
    console.error('[api] join room error', e)
    return jsonError(500, 'internal_error', 'Failed to join room')
  }
}

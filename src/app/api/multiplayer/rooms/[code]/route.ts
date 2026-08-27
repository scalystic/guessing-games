import { prisma } from '@/lib/db'
import { jsonError, jsonOk } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/multiplayer/rooms/[code]'>,
): Promise<Response> {
  const { code } = await ctx.params
  try {
    const room = await prisma.multiplayerRoom.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        players: {
          include: { player: { select: { id: true, displayName: true, avatarUrl: true } } },
          orderBy: { seatIndex: 'asc' },
        },
        game: { select: { id: true, slug: true, name: true } },
      },
    })

    if (!room) return jsonError(404, 'not_found', 'Room not found')

    return jsonOk({
      code: room.code,
      gameSlug: room.game.slug,
      gameName: room.game.name,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      maxPlayers: room.maxPlayers,
      totalRounds: room.totalRounds,
      currentRound: room.currentRound,
      players: room.players.map((p) => ({
        playerId: p.playerId,
        displayName: p.player.displayName ?? `Player ${p.seatIndex + 1}`,
        avatarUrl: p.player.avatarUrl,
        status: p.status,
        seatIndex: p.seatIndex,
        score: p.score,
        isWinner: p.isWinner,
      })),
    })
  } catch (e) {
    console.error('[api] get room error', e)
    return jsonError(500, 'internal_error', 'Failed to get room')
  }
}

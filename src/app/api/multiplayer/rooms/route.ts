import { z } from 'zod'
import { prisma } from '@/lib/db'
import { jsonError, jsonOk } from '@/lib/api/response'
import { ensurePlayer } from '@/lib/guest'
import { randomBytes } from 'node:crypto'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  gameSlug: z.string().min(1),
  totalRounds: z.number().int().min(1).max(10).default(5),
  maxPlayers: z.number().int().min(2).max(5).default(5),
})

function generateRoomCode(): string {
  return randomBytes(3).toString('hex').toUpperCase()
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? null
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Guests are real Player rows from the first tap (see schema notes on
    // Player) — multiplayer shouldn't be the one feature that requires
    // signing up first, so a room host is provisioned exactly like starting
    // a solo run does.
    const { playerId } = await ensurePlayer(clientIp(request))

    const parsed = BodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'invalid_body', 'Expected { gameSlug, totalRounds?, maxPlayers? }')

    const { gameSlug, totalRounds, maxPlayers } = parsed.data

    const game = await prisma.game.findFirst({
      where: { slug: gameSlug, isActive: true },
      select: { id: true },
    })
    if (!game) return jsonError(404, 'not_found', `No active game "${gameSlug}"`)

    let code = generateRoomCode()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.multiplayerRoom.findUnique({ where: { code } })
      if (!existing) break
      code = generateRoomCode()
      attempts++
    }

    const room = await prisma.multiplayerRoom.create({
      data: {
        code,
        gameId: game.id,
        hostPlayerId: playerId,
        totalRounds,
        maxPlayers,
        seed: randomBytes(16).toString('hex'),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        players: {
          create: {
            playerId,
            seatIndex: 0,
            status: 'WAITING',
          },
        },
      },
    })

    return jsonOk({ code: room.code, roomId: room.id, playerId })
  } catch (e) {
    console.error('[api] create room error', e)
    return jsonError(500, 'internal_error', 'Failed to create room')
  }
}

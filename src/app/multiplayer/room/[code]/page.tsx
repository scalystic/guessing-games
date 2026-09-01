import { headers } from 'next/headers'
import { ensurePlayer } from '@/lib/guest'
import { getCurrentUser } from '@/lib/get-current-user'
import { RoomClient } from './room-client'

async function clientIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [{ playerId }, user] = await Promise.all([ensurePlayer(await clientIp()), getCurrentUser()])
  return <RoomClient code={code.toUpperCase()} playerId={playerId} user={user} />
}

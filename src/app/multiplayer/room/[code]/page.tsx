import { headers } from 'next/headers'
import { ensurePlayer } from '@/lib/guest'
import { RoomClient } from './room-client'

async function clientIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { playerId } = await ensurePlayer(await clientIp())
  return <RoomClient code={code.toUpperCase()} playerId={playerId} />
}

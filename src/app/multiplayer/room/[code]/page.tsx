import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { RoomClient } from './room-client'

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const session = await getSession()
  if (!session) redirect('/')
  return <RoomClient code={code.toUpperCase()} playerId={session.playerId} />
}

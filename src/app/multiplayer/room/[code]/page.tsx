import { getExistingPlayerId } from '@/lib/guest'
import { getCurrentUser } from '@/lib/get-current-user'
import { RoomClient } from './room-client'

/// Identity is *read* here, never minted: this page is the one a first-time
/// visitor reaches by invite link with no session cookie yet, and minting one
/// during render throws ("Cookies can only be modified in a Server Action or
/// Route Handler"). A null playerId is therefore normal — the client posts the
/// room's join route, which mints the guest and seats them. See room-client.tsx.
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [playerId, user] = await Promise.all([getExistingPlayerId(), getCurrentUser()])
  return <RoomClient code={code.toUpperCase()} playerId={playerId} user={user} />
}

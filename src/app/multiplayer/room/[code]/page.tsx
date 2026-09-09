import type { Metadata } from 'next'
import { getExistingPlayerId } from '@/lib/guest'
import { getCurrentUser } from '@/lib/get-current-user'
import { RoomClient } from './room-client'

/// Rooms are invite-only and short-lived: the code identifies one session that
/// stops existing when everyone leaves, so an indexed room URL is a result
/// that leads nowhere by the time anyone clicks it.
///
/// noindex, not a robots.txt Disallow. Invite links get pasted into group chats
/// and public threads, and a disallowed URL that picks up an external link can
/// still be listed as a bare result — Google never fetches it, so it never
/// learns not to. Allowing the fetch is what makes this tag effective.
///
/// `nofollow` as well, unlike the auth pages: the links out of a room lead to
/// other ephemeral room state, not to anything worth crawling.
export const metadata: Metadata = {
  title: 'Multiplayer Room',
  description: 'A live Sargam multiplayer room.',
  robots: { index: false, follow: false },
}

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

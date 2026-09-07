import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { createSession, getSession } from "@/lib/session";

// ---------------------------------------------------------------------------
// IP hashing
// ---------------------------------------------------------------------------

const IP_SALT = process.env.IP_HASH_SALT ?? "";

/** One-way hash of a client IP. Raw IPs are never stored. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_SALT}:${ip}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Guest provisioning
// ---------------------------------------------------------------------------

type GuestResult = {
  playerId: string;
  isNew: boolean;
};

/**
 * Resolve the player behind the current session cookie — read-only.
 *
 * Returns null when there is no session, or when the session names a player row
 * that no longer exists. Unlike `ensurePlayer` this never writes a cookie, so
 * it is the only one of the two that a Server Component may call: Next.js
 * rejects cookie mutation during render ("Cookies can only be modified in a
 * Server Action or Route Handler"). A page that gets null here must leave the
 * minting to a Route Handler its client calls — the way the multiplayer room
 * page defers to the room's join route.
 */
export async function getExistingPlayerId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { id: true },
  });

  // Session cookie points at a player row that no longer exists — report "no
  // identity" so the caller mints a fresh guest, instead of handing back a
  // playerId that makes every write downstream fail Run_playerId_fkey.
  if (!player) return null;

  // Touch lastSeenAt in the background — no need to await.
  prisma.player
    .update({
      where: { id: session.playerId },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {
      /* player was deleted between the check above and here; silently ignore */
    });

  return session.playerId;
}

/**
 * Ensure the current request has a player identity.
 *
 * - If a valid session exists, returns that player.
 * - If not, creates a new GUEST player, sets the session cookie, and returns it.
 *
 * The clientIp is hashed before storage for abuse throttling.
 *
 * Writes a cookie on the mint path, so this is for Route Handlers and Server
 * Actions only. Server Components must use `getExistingPlayerId()`.
 */
export async function ensurePlayer(
  clientIp: string | null,
): Promise<GuestResult> {
  const existing = await getExistingPlayerId();
  if (existing) return { playerId: existing, isNew: false };

  // No session, or a stale one — mint a new guest.
  const player = await prisma.player.create({
    data: {
      kind: "GUEST",
      createdIpHash: clientIp ? hashIp(clientIp) : null,
    },
    select: { id: true },
  });

  await createSession(player.id, "GUEST");

  return { playerId: player.id, isNew: true };
}

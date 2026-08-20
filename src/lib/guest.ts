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
 * Ensure the current request has a player identity.
 *
 * - If a valid session exists, returns that player.
 * - If not, creates a new GUEST player, sets the session cookie, and returns it.
 *
 * The clientIp is hashed before storage for abuse throttling.
 */
export async function ensurePlayer(
  clientIp: string | null,
): Promise<GuestResult> {
  const session = await getSession();

  if (session) {
    // Touch lastSeenAt in the background — no need to await.
    prisma.player
      .update({
        where: { id: session.playerId },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {
        /* player may have been deleted; silently ignore */
      });

    return { playerId: session.playerId, isNew: false };
  }

  // No session — mint a new guest.
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

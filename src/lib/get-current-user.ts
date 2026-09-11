import "server-only";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export type CurrentUser = {
  displayName: string | null;
  /// The public, unique username (Player.handle). Null for guests, and for
  /// accounts that haven't been through the /username gate yet — the daily
  /// screen keys the leaderboard on this, not on `kind`, so an account mid-way
  /// through claiming one isn't treated as fully signed up.
  handle: string | null;
  kind: "GUEST" | "USER";
} | null;

export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) return null;

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { displayName: true, handle: true, kind: true },
  });

  if (!player) return null;

  return {
    displayName: player.displayName,
    handle: player.handle,
    kind: player.kind,
  };
}

import "server-only";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export type CurrentUser = {
  displayName: string | null;
  kind: "GUEST" | "USER";
} | null;

export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) return null;

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { displayName: true, kind: true },
  });

  if (!player) return null;

  return { displayName: player.displayName, kind: player.kind };
}

import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
};

/**
 * Reads the admin session and re-checks isAdmin against the DB on every
 * call — the JWT claim alone is never trusted, so revoking isAdmin takes
 * effect on the admin's very next request rather than waiting out the
 * session TTL. Returns null rather than redirecting, so both page layouts
 * (which redirect) and API route handlers (which return a 401 JSON body)
 * can build on the same check.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await getAdminSession();
  if (!session) return null;

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { id: true, email: true, displayName: true, isAdmin: true },
  });

  if (!player || !player.isAdmin || !player.email) return null;

  return { id: player.id, email: player.email, displayName: player.displayName };
}

/** Page/layout variant of getAdminUser() — redirects instead of returning null. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  return admin;
}

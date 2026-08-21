import "server-only";
import { cookies } from "next/headers";
import {
  encryptAdmin,
  decryptAdmin,
  adminSessionCookieOptions,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  type AdminSessionPayload,
} from "@/lib/admin/session-crypto";

export type { AdminSessionPayload } from "@/lib/admin/session-crypto";

/** Create a new admin session and set the cookie. */
export async function createAdminSession(playerId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
  const token = await encryptAdmin({ playerId, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(
    ADMIN_SESSION_COOKIE_NAME,
    token,
    adminSessionCookieOptions(expiresAt),
  );
}

/** Read and verify the admin session from the cookie. Null if absent/invalid. */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  return decryptAdmin(token);
}

/** Delete the admin session cookie. */
export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
}

import "server-only";
import { cookies } from "next/headers";
import {
  encrypt,
  decrypt,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  type SessionPayload,
} from "@/lib/session-crypto";

// Re-export types and crypto functions for convenience.
export { encrypt, decrypt, type SessionPayload } from "@/lib/session-crypto";
export { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "@/lib/session-crypto";

// ---------------------------------------------------------------------------
// Cookie-based session API (server-only — requires next/headers)
// ---------------------------------------------------------------------------

/** Create a new session and set the cookie. */
export async function createSession(
  playerId: string,
  kind: "GUEST" | "USER",
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = await encrypt({ playerId, kind, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
}

/** Read and verify the session from the cookie. Returns null if absent or invalid. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return decrypt(token);
}

/** Extend the current session's expiry (sliding window). No-op if no session. */
export async function updateSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await decrypt(token);

  if (!session) return;

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const newToken = await encrypt({
    playerId: session.playerId,
    kind: session.kind,
    expiresAt,
  });
  cookieStore.set(SESSION_COOKIE_NAME, newToken, sessionCookieOptions(expiresAt));
}

/** Delete the session cookie. */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

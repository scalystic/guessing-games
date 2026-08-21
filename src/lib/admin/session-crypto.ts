import { SignJWT, jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Admin session — parallel to src/lib/session-crypto.ts but fully decoupled:
// its own cookie name and payload shape, so a stolen player-session token is
// structurally not what this module accepts (and vice versa). Keyed off the
// same SESSION_SECRET; the separation comes from the shape/cookie split plus
// requireAdmin() re-checking isAdmin from the DB on every request, not from a
// second secret.
// ---------------------------------------------------------------------------

export type AdminSessionPayload = {
  playerId: string;
  expiresAt: Date;
};

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET is not set.");
}
const ENCODED_KEY = new TextEncoder().encode(SECRET);

/** Cookie name for the admin JWT. */
export const ADMIN_SESSION_COOKIE_NAME = "gg_admin_session";

/** Admin session lifetime in milliseconds (12 hours) — shorter than the
 * 7-day player session since this cookie carries elevated privilege. */
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function encryptAdmin(payload: AdminSessionPayload): Promise<string> {
  return new SignJWT({
    playerId: payload.playerId,
    scope: "admin",
    expiresAt: payload.expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(payload.expiresAt)
    .sign(ENCODED_KEY);
}

export async function decryptAdmin(
  token: string | undefined,
): Promise<AdminSessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, ENCODED_KEY, {
      algorithms: ["HS256"],
    });

    if (payload.scope !== "admin") return null;

    return {
      playerId: payload.playerId as string,
      expiresAt: new Date(payload.expiresAt as string),
    };
  } catch {
    return null;
  }
}

export function adminSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires: expiresAt,
    path: "/",
  };
}

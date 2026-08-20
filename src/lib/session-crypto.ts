import { SignJWT, jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionPayload = {
  playerId: string;
  kind: "GUEST" | "USER";
  expiresAt: Date;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET is not set.");
}
const ENCODED_KEY = new TextEncoder().encode(SECRET);

/** Cookie name for the JWT session. */
export const SESSION_COOKIE_NAME = "gg_session";

/** Session lifetime in milliseconds (7 days). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Encrypt / Decrypt — usable from both proxy and server components
// ---------------------------------------------------------------------------

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    playerId: payload.playerId,
    kind: payload.kind,
    expiresAt: payload.expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(payload.expiresAt)
    .sign(ENCODED_KEY);
}

export async function decrypt(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, ENCODED_KEY, {
      algorithms: ["HS256"],
    });

    return {
      playerId: payload.playerId as string,
      kind: payload.kind as "GUEST" | "USER",
      expiresAt: new Date(payload.expiresAt as string),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie options factory
// ---------------------------------------------------------------------------

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires: expiresAt,
    path: "/",
  };
}

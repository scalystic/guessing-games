import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/// Per-run bearer token. Owning the player cookie is not enough to mutate a run
/// — see docs/game-engine.md, server authority #7. The raw token is handed to
/// the client once at start and never stored; only its hash lives on
/// Run.tokenHash, so a database leak doesn't let anyone drive someone's run.

const TOKEN_BYTES = 32;

export type MintedToken = {
  /// Give this to the client. Never persisted.
  token: string;
  /// Persist this on Run.tokenHash.
  tokenHash: string;
};

export function mintRunToken(): MintedToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashRunToken(token) };
}

export function hashRunToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/// Constant-time compare. A plain `===` on the hash leaks its prefix through
/// timing, which is enough to forge a token given enough attempts.
export function runTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashRunToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  // timingSafeEqual throws on a length mismatch, which would itself be a leak.
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

/// Pull the token out of `Authorization: Bearer <token>`.
export function readRunToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;

  return value;
}

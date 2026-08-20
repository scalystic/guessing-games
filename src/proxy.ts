import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  decrypt,
  encrypt,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "@/lib/session-crypto";

/**
 * Proxy (Next.js 16 — replaces the old `middleware` convention).
 *
 * Responsibility: **Session sliding-window refresh.** If a valid session cookie
 * exists, extend its expiry so active users stay logged in.
 *
 * Guest creation is NOT done here because the proxy cannot use Prisma (it may
 * run in an Edge-like environment). Guest provisioning happens in the app layer
 * via the `ensurePlayer()` helper or lazily on the first game-related action.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await decrypt(token);

  // No session — pass through.
  if (!session) return response;

  // Session exists — extend expiry (sliding window refresh).
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const newToken = await encrypt({
    playerId: session.playerId,
    kind: session.kind,
    expiresAt,
  });

  response.cookies.set(
    SESSION_COOKIE_NAME,
    newToken,
    sessionCookieOptions(expiresAt),
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all request paths except:
     * - api (API routes — they manage their own sessions)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};

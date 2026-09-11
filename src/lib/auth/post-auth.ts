import "server-only";
import { prisma } from "@/lib/db";

/// Where to send someone the moment their session becomes a USER session.
///
/// Every account must have a public username (Player.handle), but only the
/// email signup form can collect one up front. Google hands us a name and an
/// email and nothing else, and every account that existed before usernames
/// shipped has handle = null. So the rule is enforced here, on the way out of
/// *every* auth path, rather than in each of them:
///
///   - handle set      → straight to the destination
///   - handle missing  → /username first, which returns them to it
///
/// One helper and not four copies of an `if` on purpose: a path that forgets
/// the check doesn't fail loudly, it just quietly produces an account with no
/// username that the leaderboard then has to render as "Player".
export async function postAuthDestination(
  playerId: string,
  next = "/",
): Promise<string> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { handle: true },
  });

  if (player?.handle) return next;
  return `/username?next=${encodeURIComponent(next)}`;
}

/// Guards the `next` parameter on /username.
///
/// Only same-site, absolute-path destinations. Without this, `?next=` is an
/// open redirect: a link to our own login page could bounce a freshly
/// authenticated player to any external host, which is the classic phishing
/// primitive — the victim sees a real login on the real domain and lands
/// somewhere else. Protocol-relative "//evil.com" is the case a naive
/// startsWith("/") check lets through, so it is rejected explicitly.
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}

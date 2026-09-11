import "server-only";
import { prisma } from "@/lib/db";

/// Where to send someone the moment their session becomes a USER session.
///
/// Every account must have a self-declared age and a public username
/// (Player.handle), but only the email signup form can collect both up front.
/// Google hands us a name and email only, and existing accounts can be missing
/// either field. The rule is enforced here, on the way out of every auth path:
///
///   - age missing     → /age first
///   - handle missing  → /username next
///   - both set        → straight to the destination
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
    select: { declaredAge: true, handle: true },
  });

  const encodedNext = encodeURIComponent(next);
  if (!player) return "/login";
  if (player.declaredAge === null) return `/age?next=${encodedNext}`;
  if (!player.handle) return `/username?next=${encodedNext}`;
  return next;
}

/// Guards the `next` parameter on post-auth onboarding pages.
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

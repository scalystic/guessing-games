import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { postAuthDestination, safeNextPath } from "@/lib/auth/post-auth";
import { normalizeUsername } from "@/lib/auth/username";
import UsernameForm from "./username-form";

export const metadata: Metadata = {
  title: "Pick your username",
  // Same as the other auth screens: a personal, session-bound step with
  // nothing to rank for.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/// Turns a display name into a plausible starting handle: "Arshad Khan" →
/// "arshad.khan". Illegal characters are replaced with dots, and
/// anything that ends up too short returns empty so the field starts blank
/// instead of prefilled with something that fails validation on submit.
function suggestFrom(displayName: string | null): string {
  if (!displayName) return "";
  const cleaned = normalizeUsername(displayName)
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 20)
    .replace(/\.+$/, "");
  if (cleaned.length < 3) return "";
  if (!/^[a-z0-9]/.test(cleaned)) return "";
  return cleaned;
}

/// The one screen that claims Player.handle. Every auth path routes here when
/// the account has no username yet — see postAuthDestination().
export default async function Page({
  searchParams,
}: PageProps<"/username">) {
  const params = await searchParams;
  const nextParam = params.next;
  const next = safeNextPath(typeof nextParam === "string" ? nextParam : null);

  const session = await getSession();
  // Not signed in: this form has no account to attach a username to.
  if (!session || session.kind !== "USER") redirect("/login");

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { declaredAge: true, handle: true, displayName: true },
  });

  if (!player) redirect("/login");

  // A direct visit cannot use /username to skip the age step.
  if (player.declaredAge === null) {
    redirect(await postAuthDestination(session.playerId, next));
  }

  // Already has one — this screen is a gate, not a rename form, so there is
  // nothing here for them.
  if (player.handle) redirect(next);

  return <UsernameForm next={next} suggestion={suggestFrom(player.displayName)} />;
}

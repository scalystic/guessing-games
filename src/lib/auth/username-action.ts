"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { safeNextPath } from "@/lib/auth/post-auth";
import { isUsernameTakenError, validateUsername } from "@/lib/auth/username";
import type { AuthFormState } from "@/lib/auth/validation";

/// Claims Player.handle for the player in the current session.
///
/// Used by /username, which every auth path lands on when the account has no
/// username yet — Google sign-ins (Google has no username to give us) and
/// accounts that predate the field.
///
/// Deliberately claim-once: a handle that is already set is not overwritten
/// here. It is the public identity other players see on the board, so renaming
/// belongs behind an explicit, rate-limited "change username" flow rather than
/// in the step whose whole job is to fill a blank.
export async function setUsername(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const next = safeNextPath(formData.get("next")?.toString());

  const session = await getSession();
  // Guests have no account to attach a username to. Sending them to signup is
  // the honest answer — this form cannot help them.
  if (!session || session.kind !== "USER") {
    redirect("/signup");
  }

  const result = validateUsername(formData.get("username"));
  if (!result.ok) {
    return { errors: { username: [result.message] } };
  }

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { handle: true },
  });

  // Already claimed — nothing to do, and this form is not the place to change
  // it. Move along rather than reporting an error for a satisfied precondition.
  if (player?.handle) {
    redirect(next);
  }

  try {
    await prisma.player.update({
      where: { id: session.playerId },
      data: { handle: result.username },
    });
  } catch (error) {
    // The unique index is the real arbiter — see the same catch in signup().
    if (isUsernameTakenError(error)) {
      return { errors: { username: ["That username is taken. Try another."] } };
    }
    console.error("[auth:set-username]", error);
    return { message: "Couldn't save your username. Please try again." };
  }

  redirect(next);
}

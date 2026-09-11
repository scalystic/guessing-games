"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { postAuthDestination, safeNextPath } from "@/lib/auth/post-auth";
import { AgeSchema, type AuthFormState } from "@/lib/auth/validation";

/// Records the signed-in player's age once. Age changes belong in a separate
/// profile flow; this action only fills the missing onboarding field.
export async function setAge(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const next = safeNextPath(formData.get("next")?.toString());
  const session = await getSession();

  if (!session || session.kind !== "USER") {
    redirect("/signup");
  }

  const parsed = AgeSchema.safeParse(formData.get("age"));
  if (!parsed.success) {
    return { errors: { age: parsed.error.issues.map((issue) => issue.message) } };
  }

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { declaredAge: true },
  });

  if (!player) redirect("/login");

  if (player.declaredAge !== null) {
    redirect(await postAuthDestination(session.playerId, next));
  }

  try {
    await prisma.player.update({
      where: { id: session.playerId },
      data: { declaredAge: parsed.data },
    });
  } catch (error) {
    console.error("[auth:set-age]", error);
    return { message: "Couldn't save your age. Please try again." };
  }

  redirect(await postAuthDestination(session.playerId, next));
}

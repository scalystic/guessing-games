"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createAdminSession, deleteAdminSession } from "@/lib/admin/session";
import { AdminLoginSchema, type AdminFormState } from "@/lib/admin/validation";

// ---------------------------------------------------------------------------
// Admin login — separate credential check from src/lib/auth/actions.ts login().
// Requires isAdmin: true in addition to a valid password; the "wrong
// email/password" message is deliberately identical whether the account
// doesn't exist or simply isn't an admin, so a login attempt never reveals
// which admins exist.
// ---------------------------------------------------------------------------

export async function adminLogin(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const parsed = AdminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { email, password } = parsed.data;

  const player = await prisma.player.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, isAdmin: true },
  });

  if (!player || !player.isAdmin || !player.passwordHash) {
    return { message: "Invalid email or password." };
  }

  const valid = await bcrypt.compare(password, player.passwordHash);

  if (!valid) {
    return { message: "Invalid email or password." };
  }

  await createAdminSession(player.id);

  redirect("/admin");
}

export async function adminLogout(): Promise<void> {
  await deleteAdminSession();
  redirect("/admin/login");
}

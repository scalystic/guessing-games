"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession, getSession } from "@/lib/session";
import {
  SignupSchema,
  LoginSchema,
  type AuthFormState,
} from "@/lib/auth/validation";

const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Signup — guest → user merge
// ---------------------------------------------------------------------------

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // 1. Validate
  const parsed = SignupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { displayName, email, password } = parsed.data;

  // 2. Check email uniqueness
  const existing = await prisma.player.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return {
      errors: { email: ["An account with this email already exists."] },
    };
  }

  // 3. Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 4. Get current session — the guest to merge
  const session = await getSession();
  const guestPlayerId = session?.playerId;

  try {
    if (guestPlayerId && session.kind === "GUEST") {
      // ---------- Guest → User merge (single transaction) ----------
      // Read the guest's current balances for the ledger entry.
      const guest = await prisma.player.findUnique({
        where: { id: guestPlayerId },
        select: { xp: true, coins: true },
      });

      await prisma.$transaction(async (tx) => {
        // Promote the guest row to a real user.
        await tx.player.update({
          where: { id: guestPlayerId },
          data: {
            kind: "USER",
            displayName,
            email,
            passwordHash,
            // For self-managed auth, authUserId == player id.
            authUserId: guestPlayerId,
          },
        });

        // Record the merge for auditing.
        const runCount = await tx.run.count({
          where: { playerId: guestPlayerId },
        });

        await tx.guestClaim.create({
          data: {
            guestPlayerId,
            userPlayerId: guestPlayerId,
            xpMerged: guest?.xp ?? 0,
            coinsMerged: guest?.coins ?? 0,
            runsMerged: runCount,
          },
        });

        // Write a GUEST_MERGE ledger entry.
        await tx.ledgerEntry.create({
          data: {
            playerId: guestPlayerId,
            kind: "GUEST_MERGE",
            xpDelta: 0,
            coinDelta: 0,
            reason: "Guest account merged into user account at signup.",
            meta: { displayName, email },
          },
        });
      });

      // Update session to USER.
      await createSession(guestPlayerId, "USER");
    } else {
      // ---------- Fresh signup (no guest to merge) ----------
      const player = await prisma.player.create({
        data: {
          kind: "USER",
          displayName,
          email,
          passwordHash,
          authUserId: undefined, // set after creation
        },
        select: { id: true },
      });

      // Set authUserId = player.id for self-managed auth.
      await prisma.player.update({
        where: { id: player.id },
        data: { authUserId: player.id },
      });

      await createSession(player.id, "USER");
    }
  } catch (error) {
    console.error("[auth:signup]", error);
    return { message: "Something went wrong. Please try again." };
  }

  redirect("/");
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // 1. Validate
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { email, password } = parsed.data;

  // 2. Find user
  const player = await prisma.player.findUnique({
    where: { email },
    select: { id: true, kind: true, passwordHash: true },
  });

  if (!player || player.kind !== "USER" || !player.passwordHash) {
    return { message: "Invalid email or password." };
  }

  // 3. Verify password
  const valid = await bcrypt.compare(password, player.passwordHash);

  if (!valid) {
    return { message: "Invalid email or password." };
  }

  // 4. Create session
  await createSession(player.id, "USER");

  redirect("/");
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}

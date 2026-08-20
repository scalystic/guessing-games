import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, getSession } from "@/lib/session";
import { SignupSchema } from "@/lib/auth/validation";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

const BCRYPT_ROUNDS = 12;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();

    // Validate
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        422,
        "validation_error",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { displayName, email, password } = parsed.data;

    // Check email uniqueness
    const existing = await prisma.player.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return jsonError(409, "email_taken", "An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const session = await getSession();
    const guestPlayerId = session?.kind === "GUEST" ? session.playerId : null;

    if (guestPlayerId) {
      // Guest → User merge
      const guest = await prisma.player.findUnique({
        where: { id: guestPlayerId },
        select: { xp: true, coins: true },
      });

      await prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: guestPlayerId },
          data: {
            kind: "USER",
            displayName,
            email,
            passwordHash,
            authUserId: guestPlayerId,
          },
        });

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

        await tx.ledgerEntry.create({
          data: {
            playerId: guestPlayerId,
            kind: "GUEST_MERGE",
            xpDelta: 0,
            coinDelta: 0,
            reason: "Guest account merged into user account at signup.",
          },
        });
      });

      await createSession(guestPlayerId, "USER");
      return jsonOk({ playerId: guestPlayerId });
    } else {
      // Fresh signup
      const player = await prisma.player.create({
        data: {
          kind: "USER",
          displayName,
          email,
          passwordHash,
        },
        select: { id: true },
      });

      await prisma.player.update({
        where: { id: player.id },
        data: { authUserId: player.id },
      });

      await createSession(player.id, "USER");
      return jsonOk({ playerId: player.id }, { status: 201 });
    }
  } catch (error) {
    return internalErrorJson("auth.signup", error);
  }
}

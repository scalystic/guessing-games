import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { LoginSchema } from "@/lib/auth/validation";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();

    // Validate
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        422,
        "validation_error",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { email, password } = parsed.data;

    // Find user
    const player = await prisma.player.findUnique({
      where: { email },
      select: { id: true, kind: true, passwordHash: true },
    });

    if (!player || player.kind !== "USER" || !player.passwordHash) {
      return jsonError(401, "invalid_credentials", "Invalid email or password.");
    }

    // Verify password
    const valid = await bcrypt.compare(password, player.passwordHash);
    if (!valid) {
      return jsonError(401, "invalid_credentials", "Invalid email or password.");
    }

    // Create session
    await createSession(player.id, "USER");

    return jsonOk({ playerId: player.id });
  } catch (error) {
    return internalErrorJson("auth.login", error);
  }
}

import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ensurePlayer } from "@/lib/guest";

export const dynamic = "force-dynamic";

/// Letters (any script — this catalog is full of non-Latin names), numbers,
/// spaces, and a small set of punctuation. Deliberately an allowlist, not a
/// blocklist: this value gets interpolated into server-built HTML strings
/// (chat announcements, "X joined the room") that render via
/// dangerouslySetInnerHTML, so anything outside plain text — angle brackets
/// above all — must never reach the database in the first place.
const BodySchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(24, "Keep it under 24 characters.")
    .regex(/^[\p{L}\p{N} .,'_-]+$/u, "Only letters, numbers, spaces, and . , ' _ - are allowed."),
});

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? null;
}

/// POST /api/players/display-name — lets a guest (or anyone) pick a name that
/// shows up everywhere Player.displayName is read: multiplayer chat, round
/// announcements, leaderboards. Provisions a guest identity if the caller
/// doesn't have one yet, same as starting a run does.
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(
        400,
        "invalid_body",
        parsed.error.issues[0]?.message ?? "Invalid name.",
      );
    }

    const { playerId } = await ensurePlayer(clientIp(request));

    await prisma.player.update({
      where: { id: playerId },
      data: { displayName: parsed.data.displayName },
    });

    return jsonOk({ displayName: parsed.data.displayName });
  } catch (e) {
    console.error("[api] set display name error", e);
    return jsonError(500, "internal_error", "Failed to save your name.");
  }
}

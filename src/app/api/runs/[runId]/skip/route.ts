import { z } from "zod";
import { prisma } from "@/lib/db";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { readRunToken, runTokenMatches } from "@/lib/game/run-token";
import { applyAttempt, AttemptFailure } from "@/lib/game/attempt";

/// POST /api/runs/[runId]/skip
///
/// Identical to a wrong guess, recorded with isSkip = true. Sharing the attempt
/// path is what keeps attemptIndex a single dense sequence — a separate skip
/// counter would let a client advance the ladder twice for one attempt slot.

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/runs/[runId]/skip">,
): Promise<Response> {
  const { runId } = await ctx.params;

  try {
    const token = readRunToken(request);
    if (!token) {
      return jsonError(401, "missing_run_token", "Authorization: Bearer <run token> required.");
    }

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "invalid_body", "Expected { idempotencyKey }.");
    }

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: { tokenHash: true },
    });
    if (!run || !runTokenMatches(token, run.tokenHash)) {
      return jsonError(404, "not_found", "No such run.");
    }

    const result = await applyAttempt({
      runId,
      idempotencyKey: parsed.data.idempotencyKey,
      guessedPuzzleId: null,
      rawInput: null,
      isSkip: true,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof AttemptFailure) {
      return jsonError(409, error.detail.kind, "This round cannot take another attempt.");
    }
    return internalErrorJson("runs.skip", error);
  }
}

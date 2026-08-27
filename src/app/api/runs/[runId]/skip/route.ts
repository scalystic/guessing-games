import { z } from "zod";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { readRunToken } from "@/lib/game/run-token";
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

    // Token verified inside the locking read — see the note in guess/route.ts.
    const result = await applyAttempt({
      runId,
      runToken: token,
      idempotencyKey: parsed.data.idempotencyKey,
      guessedPuzzleId: null,
      rawInput: null,
      isSkip: true,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof AttemptFailure) {
      if (error.detail.kind === "not_found") {
        return jsonError(404, "not_found", "No such run.");
      }
      return jsonError(409, error.detail.kind, "This round cannot take another attempt.");
    }
    return internalErrorJson("runs.skip", error);
  }
}

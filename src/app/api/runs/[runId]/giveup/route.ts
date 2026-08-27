import { z } from "zod";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { readRunToken } from "@/lib/game/run-token";
import { applyGiveUp, AttemptFailure } from "@/lib/game/attempt";

/// POST /api/runs/[runId]/giveup
///
/// Resolves the current round as FAILED, spending every attempt still unspent.
///
/// This exists because the client used to implement giving up by calling /skip in
/// a loop until the round resolved. That is up to six sequential HTTP requests,
/// each opening its own transaction and each paying full round-trip latency to
/// the database — comfortably the slowest thing a player could do. The outcome is
/// identical, so the loop belongs on the server side of one transaction.

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  /// Base key. The engine derives one key per attempt slot from it, so retrying
  /// the whole give-up stays a no-op rather than failing partway.
  idempotencyKey: z.string().min(8).max(96),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/runs/[runId]/giveup">,
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

    const result = await applyGiveUp({
      runId,
      runToken: token,
      idempotencyKeyPrefix: parsed.data.idempotencyKey,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof AttemptFailure) {
      if (error.detail.kind === "not_found") {
        return jsonError(404, "not_found", "No such run.");
      }
      return jsonError(409, error.detail.kind, "This round cannot be given up.");
    }
    return internalErrorJson("runs.giveup", error);
  }
}

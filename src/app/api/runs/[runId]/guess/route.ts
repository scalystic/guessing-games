import { z } from "zod";
import { prisma } from "@/lib/db";
import { internalErrorJson, jsonError, jsonOk } from "@/lib/api/response";
import { readRunToken, runTokenMatches } from "@/lib/game/run-token";
import { applyAttempt, AttemptFailure } from "@/lib/game/attempt";

/// POST /api/runs/[runId]/guess
///
/// The client sends a puzzleId it picked from the typeahead — which is a
/// catalog-wide search with no idea which round is active, so naming a candidate
/// leaks nothing. Correctness is decided server-side against the round's own
/// puzzleId; rawInput is stored only to tune aliases later.

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  guessedPuzzleId: z.string().min(1).nullish(),
  rawInput: z.string().max(200).nullish(),
  /// Client-generated and globally unique. Makes a retried request a no-op
  /// instead of a free extra attempt.
  idempotencyKey: z.string().min(8).max(128),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/runs/[runId]/guess">,
): Promise<Response> {
  const { runId } = await ctx.params;

  try {
    const token = readRunToken(request);
    if (!token) {
      return jsonError(401, "missing_run_token", "Authorization: Bearer <run token> required.");
    }

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "invalid_body", "Expected { guessedPuzzleId?, idempotencyKey }.");
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
      guessedPuzzleId: parsed.data.guessedPuzzleId ?? null,
      rawInput: parsed.data.rawInput ?? null,
      isSkip: false,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof AttemptFailure) {
      return jsonError(409, error.detail.kind, describeFailure(error));
    }
    return internalErrorJson("runs.guess", error);
  }
}

function describeFailure(error: AttemptFailure): string {
  switch (error.detail.kind) {
    case "not_in_progress":
      return `Run is ${error.detail.status}.`;
    case "no_current_round":
      return "This run has no round in progress.";
    case "already_resolved":
      return "This round is already resolved.";
  }
}

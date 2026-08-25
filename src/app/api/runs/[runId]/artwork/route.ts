import { prisma } from "@/lib/db";
import { jsonError, internalErrorJson } from "@/lib/api/response";
import { readRunToken, runTokenMatches } from "@/lib/game/run-token";
import { readObject } from "@/lib/storage";

/// Serves the cover art for the most recently RESOLVED round.
///
/// There is no in-play mode here, and that is the entire security model: a cover
/// names the song and usually the film, so it IS the answer. Where the audio
/// route has a ladder to meter out, this has nothing to reveal progressively —
/// it is all-or-nothing, and "nothing" is the only correct response until the
/// round is over.
///
/// So this deliberately mirrors only the `?reveal=1` branch of
/// runs/[runId]/audio: latest resolved round for this run, never the current
/// one. Resolving a round opens the next in the same transaction
/// (game/attempt.ts advance()), so by the time the result panel is on screen
/// Run.currentRoundIndex has already moved past the round being displayed.
///
/// Note what is NOT in the URL: no puzzleId and no storage key. Both are read
/// server-side, so a client cannot ask for another puzzle's cover by editing a
/// path, and the content-addressed key never reaches the browser.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/runs/[runId]/artwork">,
): Promise<Response> {
  const { runId } = await ctx.params;

  try {
    const token = readRunToken(request);
    if (!token) {
      return jsonError(401, "missing_run_token", "Authorization: Bearer <run token> required.");
    }

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: { tokenHash: true },
    });

    // Same response for "no such run" and "wrong token": distinguishing them
    // tells an attacker which run ids are real.
    if (!run || !runTokenMatches(token, run.tokenHash)) {
      return jsonError(404, "not_found", "No such run.");
    }

    // No run.status check. A completed run still has an answer to display, and
    // unlike the in-play audio path there is nothing here that a finished run
    // should stop being able to see.
    const round = await prisma.runRound.findFirst({
      where: { runId, outcome: { not: "PENDING" } },
      orderBy: { roundIndex: "desc" },
      select: {
        puzzle: {
          select: {
            assets: {
              where: { kind: "IMAGE" as const },
              select: { storageKey: true, mimeType: true, byteSize: true },
            },
          },
        },
      },
    });

    if (!round) {
      return jsonError(409, "no_resolved_round", "This run has no resolved round to reveal.");
    }

    const asset = round.puzzle.assets[0];
    // Absence is normal, not an error: artwork is optional at ingest and the
    // catalog has puzzles without it. 404 lets the client fall back to the
    // generated gradient (lib/cover.ts) instead of showing a broken image.
    if (!asset) {
      return jsonError(404, "no_artwork", "This puzzle has no cover art.");
    }

    const bytes = await readObject(asset.storageKey);

    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": asset.mimeType ?? "image/webp",
        "Content-Length": String(bytes.length),
        // Not cached, for the same reason the audio isn't: this one URL returns
        // a different cover as the run advances, so a cached response would pin
        // the result panel to a previous round's answer — and a shared cache
        // would hand one player another's.
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    return internalErrorJson("runs.artwork", error);
  }
}

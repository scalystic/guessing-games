import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getAdminUser } from "@/lib/admin/auth";
import { SongMetadataSchema } from "@/lib/admin/song-validation";
import { buildSearchText, computeDecade } from "@/lib/catalog/search-text";
import { jsonError, jsonOk, internalErrorJson, notFoundJson } from "@/lib/api/response";

type RouteParams = { params: Promise<{ puzzleId: string }> };

/** Edit a song's metadata. Same field set as POST /api/song. */
export async function PUT(request: Request, { params }: RouteParams): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  const { puzzleId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.");
  }

  const parsed = SongMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "validation_error",
      "Please fix the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  const existing = await prisma.song.findUnique({
    where: { puzzleId },
    select: { puzzleId: true },
  });
  if (!existing) return notFoundJson(`No song found for puzzle ${puzzleId}.`);

  const decade = computeDecade(data.releaseYear);
  const searchText = buildSearchText(data.title, data.artist);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.puzzle.update({
        where: { id: puzzleId },
        data: {
          // popularity deliberately omitted — left alone on update, mirroring
          // scripts/ingest.ts persist()'s create-vs-update asymmetry.
          seedPopularity: data.seedPopularity,
          isActive: data.isActive,
          isBlocked: data.isBlocked,
          licenseSource: data.licenseSource ?? null,
          ingestSource: data.ingestSource ?? null,
          ingestRef: data.ingestRef ?? null,
        },
      });

      await tx.song.update({
        where: { puzzleId },
        data: {
          title: data.title,
          artist: data.artist,
          album: data.album ?? null,
          movie: data.movie ?? null,
          releaseYear: data.releaseYear ?? null,
          decade,
          genres: data.genres,
          hookStartMs: data.hookStartMs,
          isrc: data.isrc ?? null,
          externalId: data.externalId ?? null,
          aliases: data.aliases,
          searchText,
        },
      });
    });

    return jsonOk({ puzzleId });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(
        409,
        "duplicate_ingest_ref",
        "A puzzle with this game, ingest source, and ingest ref already exists.",
        { ingestRef: ["A puzzle with this game, ingest source, and ingest ref already exists."] },
      );
    }
    return internalErrorJson("song:update", error);
  }
}

/**
 * Hard delete. RunRound.puzzle has no onDelete set, so Postgres defaults to
 * RESTRICT — deleting a puzzle any player has actually played throws a
 * foreign-key violation, caught below as a friendly 409 rather than a 500.
 *
 * With the PrismaPg driver adapter, that violation surfaces as P2039 (a
 * wrapped driverAdapterError), not the classic P2003 query-engine code —
 * confirmed against a real Postgres RESTRICT violation.
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  const { puzzleId } = await params;

  try {
    await prisma.puzzle.delete({ where: { id: puzzleId } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014" || error.code === "P2039")
    ) {
      return jsonError(
        409,
        "song_already_played",
        'Can\'t delete — this song has already been played. Use "Remove from catalog" instead.',
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return notFoundJson(`No puzzle found with id ${puzzleId}.`);
    }
    return internalErrorJson("song:delete", error);
  }

  return jsonOk({ puzzleId });
}

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getAdminUser } from "@/lib/admin/auth";
import { SongMetadataSchema, type SongMetadataInput } from "@/lib/admin/song-validation";
import { hasAllowedAudioExtension, ALLOWED_AUDIO_EXTENSIONS } from "@/lib/admin/audio-file";
import {
  parseAudioFile,
  UnparsableAudioFileError,
  MAX_AUDIO_UPLOAD_BYTES,
} from "@/lib/admin/parse-song-file";
import { buildSearchText, computeDecade } from "@/lib/catalog/search-text";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

// The single game this admin API manages catalog entries for. A fresh
// lookup, not src/lib/games.ts's getActiveGameBySlug — that helper filters
// to isActive: true and hides the tuning fields (popularity, config) an
// admin needs to see and set.
async function getSonglessGameId(): Promise<string | null> {
  const game = await prisma.game.findUnique({
    where: { slug: "songless" },
    select: { id: true },
  });
  return game?.id ?? null;
}

const SORTABLE_FIELDS = ["title", "artist", "popularity"] as const;
type SortField = (typeof SORTABLE_FIELDS)[number];

const PAGE_SIZE = 10;

/**
 * GET /api/song?q=&status=active|removed|missing-clip&sort=title|artist|popularity&dir=asc|desc&page=1
 *
 * `counts` are catalog-wide (ignore q/status, used for the stat-card tabs);
 * `matchedCount`/`totalPages` describe the current q+status filter, which is
 * what the page/Previous/Next controls page through.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  const status = url.searchParams.get("status") ?? "all";
  const sortParam = url.searchParams.get("sort") ?? "title";
  const sort: SortField = (SORTABLE_FIELDS as readonly string[]).includes(sortParam)
    ? (sortParam as SortField)
    : "title";
  const dir: "asc" | "desc" = url.searchParams.get("dir") === "desc" ? "desc" : "asc";
  const pageParam = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const statusWhere =
    status === "active"
      ? { isBlocked: false }
      : status === "removed"
        ? { isBlocked: true }
        : status === "missing-clip"
          ? { assets: { none: { kind: "AUDIO_CLIP" as const } } }
          : undefined;

  const where = {
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { artist: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(statusWhere ? { puzzle: statusWhere } : {}),
  };

  const [songs, matchedCount, totalCount, activeCount, removedCount, missingClipCount] =
    await Promise.all([
      prisma.song.findMany({
        where,
        include: {
          puzzle: {
            select: {
              id: true,
              popularity: true,
              seedPopularity: true,
              isActive: true,
              isBlocked: true,
            },
          },
        },
        orderBy:
          sort === "artist"
            ? { artist: dir }
            : sort === "popularity"
              ? { puzzle: { popularity: dir } }
              : { title: dir },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.song.count({ where }),
      prisma.song.count(),
      prisma.puzzle.count({ where: { isBlocked: false } }),
      prisma.puzzle.count({ where: { isBlocked: true } }),
      prisma.puzzle.count({ where: { assets: { none: { kind: "AUDIO_CLIP" } } } }),
    ]);

  return jsonOk({
    songs: songs.map((song) => ({
      puzzleId: song.puzzle.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      popularity: song.puzzle.popularity,
      isActive: song.puzzle.isActive,
      isBlocked: song.puzzle.isBlocked,
    })),
    counts: {
      total: totalCount,
      active: activeCount,
      removed: removedCount,
      missingClip: missingClipCount,
    },
    page,
    pageSize: PAGE_SIZE,
    matchedCount,
    totalPages: Math.max(1, Math.ceil(matchedCount / PAGE_SIZE)),
  });
}

/// Form fields that aren't the file, coerced from strings into the shape
/// SongMetadataSchema expects. Shared shape with the JSON body POST used to
/// accept — a multipart request just carries the same fields as strings
/// plus an optional `file`.
function metadataFromFormData(formData: FormData): Record<string, unknown> {
  const str = (key: string): string | undefined => {
    const v = formData.get(key);
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed === "" ? undefined : trimmed;
  };
  const num = (key: string): number | undefined => {
    const v = str(key);
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const csv = (key: string): string[] => {
    const v = formData.get(key);
    if (typeof v !== "string") return [];
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };
  // undefined (not false) when the key is absent, so SongMetadataSchema's
  // .default(true)/.default(false) still applies — the minimal file-only add
  // flow never sends isActive/isBlocked at all and shouldn't be treated as
  // if it explicitly unchecked them.
  const bool = (key: string): boolean | undefined => {
    const v = formData.get(key);
    if (v === null) return undefined;
    return v === "true" || v === "on";
  };

  return {
    title: str("title"),
    artist: str("artist"),
    album: str("album"),
    releaseYear: num("releaseYear"),
    genres: csv("genres"),
    aliases: csv("aliases"),
    hookStartMs: num("hookStartMs"),
    seedPopularity: num("seedPopularity"),
    licenseSource: str("licenseSource"),
    ingestSource: str("ingestSource"),
    ingestRef: str("ingestRef"),
    isrc: str("isrc"),
    externalId: str("externalId"),
    isActive: bool("isActive"),
    isBlocked: bool("isBlocked"),
  };
}

/**
 * Create a song. Accepts either a JSON body (metadata only) or
 * multipart/form-data carrying the same fields plus an optional `file` —
 * the actual upload path used by the admin add-song form. The file is
 * validated (extension allowlist) and its tags are read to fill in any
 * field the admin left blank, but the bytes are never stored: this API
 * still doesn't cut a reveal clip or create a PuzzleAsset (no ffmpeg here)
 * — `npm run ingest` is what turns a file into a playable clip.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  const contentType = request.headers.get("content-type") ?? "";
  let rawInput: Record<string, unknown>;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError(400, "invalid_form_data", "Expected multipart/form-data.");
    }

    const file = formData.get("file");
    rawInput = metadataFromFormData(formData);

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
        return jsonError(413, "file_too_large", "File exceeds the 30MB limit.");
      }
      if (!hasAllowedAudioExtension(file.name)) {
        return jsonError(
          422,
          "unsupported_extension",
          `Only audio files are supported (${ALLOWED_AUDIO_EXTENSIONS.join(", ")}).`,
        );
      }

      try {
        const parsedFromFile = await parseAudioFile(file);
        // Fill gaps only — an explicit field the admin typed always wins.
        rawInput.title ??= parsedFromFile.title;
        rawInput.artist ??= parsedFromFile.artist;
        rawInput.album ??= parsedFromFile.album;
        rawInput.releaseYear ??= parsedFromFile.releaseYear;
        if (!(rawInput.genres as string[])?.length && parsedFromFile.genres?.length) {
          rawInput.genres = parsedFromFile.genres;
        }
      } catch (error) {
        if (!(error instanceof UnparsableAudioFileError)) {
          return internalErrorJson("song:create:parse", error);
        }
        // Unparsable tags aren't fatal for creation — fall through to the
        // filename/default fallbacks below.
      }

      // Last-resort defaults for the file-only add flow: title/artist and
      // seedPopularity are required by the schema (and by Puzzle/Song not
      // being nullable), but a bare file upload with no usable tags and no
      // other fields still has to succeed rather than bounce with a
      // validation error the minimal form has no field to fix.
      if (!rawInput.title) {
        const base = file.name.replace(/\.[^./]+$/, "").replace(/[_-]+/g, " ").trim();
        rawInput.title = base || "Untitled";
      }
      rawInput.artist ??= "Unknown Artist";
      rawInput.seedPopularity ??= 50;
    }
  } else {
    try {
      rawInput = await request.json();
    } catch {
      return jsonError(400, "invalid_json", "Request body must be JSON.");
    }
  }

  const parsed = SongMetadataSchema.safeParse(rawInput);
  if (!parsed.success) {
    return jsonError(
      422,
      "validation_error",
      "Please fix the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  return createSong(parsed.data);
}

async function createSong(data: SongMetadataInput): Promise<Response> {
  const gameId = await getSonglessGameId();
  if (!gameId) {
    return jsonError(500, "game_not_found", 'Game "songless" not found. Run npm run db:seed.');
  }

  const decade = computeDecade(data.releaseYear);
  const searchText = buildSearchText(data.title, data.artist);

  try {
    const puzzleId = await prisma.$transaction(async (tx) => {
      const puzzle = await tx.puzzle.create({
        data: {
          gameId,
          // popularity is set from the seed on CREATE only — telemetry
          // retuning owns this column once a puzzle is live (mirrors
          // scripts/ingest.ts persist()).
          popularity: data.seedPopularity,
          seedPopularity: data.seedPopularity,
          isActive: data.isActive,
          isBlocked: data.isBlocked,
          licenseSource: data.licenseSource ?? null,
          ingestSource: data.ingestSource ?? null,
          ingestRef: data.ingestRef ?? null,
        },
      });

      await tx.song.create({
        data: {
          puzzleId: puzzle.id,
          title: data.title,
          artist: data.artist,
          album: data.album ?? null,
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

      return puzzle.id;
    });

    return jsonOk({ puzzleId }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(
        409,
        "duplicate_ingest_ref",
        "A puzzle with this game, ingest source, and ingest ref already exists.",
        { ingestRef: ["A puzzle with this game, ingest source, and ingest ref already exists."] },
      );
    }
    return internalErrorJson("song:create", error);
  }
}

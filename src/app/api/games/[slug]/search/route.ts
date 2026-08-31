import { prisma } from "@/lib/db";
import { internalErrorJson, jsonOk, notFoundJson } from "@/lib/api/response";
import { normalizeSearchText } from "@/lib/game/search-text";

/// GET /api/games/[slug]/search?q=kesar
///
/// The typeahead behind the guess box. Catalog-wide and completely unaware of
/// which round is active — that is what makes it safe to hand back real
/// `puzzleId`s (docs/game-engine.md, authority #1). The client picks one and
/// POSTs it to /guess, where correctness is decided against the round's own
/// puzzleId.
///
/// Results are restricted to PLAYABLE puzzles, matching the selector's
/// definition: active, not blocked, and holding an AUDIO_CLIP whose
/// stageByteOffsets cover every stage. Offering a candidate the sampler would
/// never serve is harmless for correctness but makes the catalog look bigger
/// than it is.

export const dynamic = "force-dynamic";

/// One character matches most of the catalog and ranks it meaninglessly.
const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/// Cached slug -> game config, because this route runs on every keystroke.
///
/// Looking it up cost a round trip BEFORE the search query could even start —
/// roughly half the latency of a typeahead request spent re-reading two columns
/// that change when an admin edits the game, which is approximately never.
///
/// A short TTL rather than a permanent cache so an edit takes effect without a
/// deploy, and per-process so there is nothing to invalidate.
const GAME_CACHE_TTL_MS = 60_000;
const gameCache = new Map<string, { at: number; game: { id: string; maxAttempts: number } | null }>();

async function activeGame(slug: string): Promise<{ id: string; maxAttempts: number } | null> {
  const hit = gameCache.get(slug);
  if (hit && Date.now() - hit.at < GAME_CACHE_TTL_MS) return hit.game;

  const game = await prisma.game.findFirst({
    where: { slug, isActive: true },
    select: { id: true, maxAttempts: true },
  });

  // Misses are cached too — otherwise a bad slug typed into the URL bar would
  // hit the database once per keystroke.
  gameCache.set(slug, { at: Date.now(), game });
  return game;
}

type Row = {
  puzzleId: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
};

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/games/[slug]/search">,
): Promise<Response> {
  const { slug } = await ctx.params;

  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("q") ?? "";
    const query = normalizeSearchText(raw);

    const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(MAX_LIMIT, Math.max(1, limitParam))
      : DEFAULT_LIMIT;

    // Empty rather than 400: a typeahead sends a request per keystroke, and the
    // first one or two are legitimately too short to answer.
    if (query.length < MIN_QUERY_LENGTH) return jsonOk([]);

    const game = await activeGame(slug);
    if (!game) return notFoundJson(`No active game with slug "${slug}".`);

    // Raw SQL because none of the three things this query needs are expressible
    // in Prisma: the trigram operators, a similarity ORDER BY, and the
    // unnest over Song.aliases.
    //
    // Two matchers, both served by the GIN trigram index on Song.searchText:
    //   LIKE '%q%'  — the ordinary substring case, "kesar" -> "kesariya"
    //   q <% text   — word_similarity, which tolerates a typo ("kesria").
    //                 Plain `%` (similarity) is the wrong operator here: it
    //                 normalises over the WHOLE column, so a 5-character query
    //                 against "kesariya arijit singh" scores far below any
    //                 sane threshold and would never match.
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT s."puzzleId", s.title, s.artist, s.album, s."releaseYear"
      FROM "Song" s
      JOIN "Puzzle" p
        ON p.id = s."puzzleId"
      LEFT JOIN "PuzzleAsset" a
        ON a."puzzleId" = p.id
       AND a.kind = 'AUDIO_CLIP'::"AssetKind"
      WHERE p."gameId" = ${game.id}
        AND p."isActive" = true
        AND p."isBlocked" = false
        AND (
          s."externalId" IS NOT NULL
          OR coalesce(array_length(a."stageByteOffsets", 1), 0) >= ${game.maxAttempts}
        )
        AND (
          s."searchText" LIKE ${`%${query}%`}
          OR ${query} <% s."searchText"
          OR EXISTS (
            SELECT 1 FROM unnest(s.aliases) alias
            WHERE lower(alias) LIKE ${`%${query}%`}
          )
        )
      ORDER BY
        -- Prefix of "title artist" first: someone typing "kesa" wants Kesariya
        -- above a track merely containing the letters somewhere.
        (s."searchText" LIKE ${`${query}%`}) DESC,
        word_similarity(${query}, s."searchText") DESC,
        s.title ASC
      LIMIT ${limit}
    `;

    return jsonOk(rows);
  } catch (error) {
    return internalErrorJson("games.search", error);
  }
}

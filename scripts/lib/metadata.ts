// Metadata resolution for a master audio file — embedded tags in, clean
// title/artist/album/year plus a cover image out.
//
// Two sources, in priority order:
//
//   1. iTunes Search API. Free, no key, returns proper square album art and a
//      canonical title/artist/album/year.
//   2. The master's own ID3 tags, including any embedded APIC picture.
//
// The masters in this catalog were tagged by a YouTube downloader, so their
// titles are video titles ("Barbaad Song | Saiyaara", "Ikk Kudi - Full Video")
// and their embedded art is a 16:9 video thumbnail rather than cover art. That
// shapes everything here: the tag title is treated as a SEARCH QUERY to be
// cleaned rather than as a value to store, and the embedded picture is only a
// fallback for when iTunes has no match.

import { parseFile } from 'music-metadata'
import { buildSearchText } from '../../src/lib/catalog/search-text'

// ---------------------------------------------------------------------------
// Embedded tags
// ---------------------------------------------------------------------------

export type EmbeddedTags = {
  title: string | null
  artist: string | null
  album: string | null
  year: number | null
  durationMs: number | null
  /// First APIC frame, if the file carries one.
  picture: { data: Buffer; format: string } | null
}

export async function readTags(path: string): Promise<EmbeddedTags> {
  const parsed = await parseFile(path)
  const common = parsed.common
  const picture = common.picture?.[0]

  return {
    title: common.title?.trim() || null,
    artist: common.artist?.trim() || null,
    album: common.album?.trim() || null,
    year: common.year ?? null,
    durationMs: parsed.format.duration ? Math.round(parsed.format.duration * 1000) : null,
    picture: picture ? { data: Buffer.from(picture.data), format: picture.format } : null,
  }
}

// ---------------------------------------------------------------------------
// Turning a video title into a search query
// ---------------------------------------------------------------------------

/// Parenthesised or bracketed noise a downloader leaves behind.
const BRACKETED_NOISE =
  /[([{]\s*(official|full|lyric|lyrical|music|audio|video|hd|4k|visualizer|visualiser|slowed|reverb|remix|teaser|trailer|promo|out now|prod\.?[^)\]}]*)[^)\]}]*[)\]}]/gi

/// Standalone noise words, wherever they appear once the brackets are gone.
const BARE_NOISE =
  /\b(official\s+(music\s+)?video|official\s+audio|full\s+video(\s+song)?|video\s+song|title\s+song|lyric(al)?\s+video|lyric(al)?|music\s+video|full\s+song|audio\s+song|out\s+now|hd|4k)\b/gi

/// Leading "@handle" — a YouTube channel mention pasted into the title.
const LEADING_HANDLE = /^\s*@\S+\s*[-–—|]?\s*/

const SEPARATORS = /\s+[-–—|]\s+|\s*\|\s*/

/// Strip the downloader's decoration from a video title. Returns the bare
/// phrase; splitting it into title and artist is a separate, lossier guess.
export function cleanTitle(raw: string): string {
  return raw
    .replace(LEADING_HANDLE, '')
    .replace(BRACKETED_NOISE, ' ')
    .replace(BARE_NOISE, ' ')
    // Leftover empty brackets from the substitutions above.
    .replace(/[([{]\s*[)\]}]/g, ' ')
    .replace(/\s*[-–—|]\s*$/, '')
    .replace(/^\s*[-–—|]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/// Candidate search queries for one file, best guess first.
///
/// Deliberately several: a video title can put the artist first
/// ("Anuv Jain - HUSN"), the song first ("AGG BANKE - Talwiinder, ..."), or bury
/// the film after a pipe ("Barbaad Song | Saiyaara"). Rather than guess which,
/// try each and let match scoring pick the winner.
export function searchQueries(tags: EmbeddedTags, fallbackName: string): string[] {
  const queries: string[] = []
  const push = (value: string | null | undefined) => {
    const cleaned = value ? cleanTitle(value) : ''
    if (cleaned && !queries.includes(cleaned)) queries.push(cleaned)
  }

  // A curated artist from the manifest plus the cleaned title is the strongest
  // signal there is, so it goes first when both exist.
  if (tags.artist && tags.title) push(`${cleanTitle(tags.title)} ${tags.artist}`)
  push(tags.title)

  // Each side of the first separator, on its own. One of them is usually the
  // song name and the other the artist or the film.
  if (tags.title) {
    for (const part of cleanTitle(tags.title).split(SEPARATORS)) {
      const trimmed = part.trim()
      if (trimmed.length >= 3) push(trimmed)
    }
  }

  // Last resort: the filename, which in this repo is already a clean slug.
  push(fallbackName.replace(/[-_]+/g, ' '))

  return queries
}

// ---------------------------------------------------------------------------
// iTunes Search API
// ---------------------------------------------------------------------------

export type ItunesMatch = {
  title: string
  artist: string
  album: string | null
  /// Bare film title, and null unless the store said this is a film track —
  /// see detectFilm. Never a guess: an unrecognised collection stays null
  /// rather than being reported as a film nobody confirmed.
  movie: string | null
  year: number | null
  genre: string | null
  durationMs: number | null
  /// Highest-resolution artwork URL we can construct from the 100px one.
  artworkUrl: string | null
  trackId: number | null
  /// Combined 0-1 confidence. Below ACCEPT_SCORE the caller should treat the
  /// match as untrustworthy.
  score: number
  /// Kept separate for the report: "right artist, wrong song" and "right song,
  /// unlisted collaborator" are different problems and need different fixes.
  titleScore: number
  artistScore: number
  /// 0 when the caller had no album to compare against.
  albumScore: number
  query: string
}

const ITUNES_ENDPOINT = 'https://itunes.apple.com/search'

/// Apple's docs ask for no more than ~20 calls/minute from one address.
const REQUEST_SPACING_MS = 1500
let lastRequestAt = 0

async function throttle(): Promise<void> {
  const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

/// Dice coefficient over normalised word tokens.
///
/// Not string distance: the query and the result routinely disagree on word
/// ORDER and on how many collaborating artists are listed, and edit distance
/// punishes both heavily. Shared-token overlap does not.
function similarity(a: string, b: string): number {
  const tokens = (value: string) =>
    new Set(buildSearchText(value, '').split(' ').filter((t) => t.length > 1))

  const left = tokens(a)
  const right = tokens(b)
  if (left.size === 0 || right.size === 0) return 0

  let shared = 0
  for (const token of left) if (right.has(token)) shared++
  return (2 * shared) / (left.size + right.size)
}

/// Below this a match is reported but flagged for review rather than trusted.
export const ACCEPT_SCORE = 0.6

/// The title must clear this ON ITS OWN, no matter how well the artist matches.
///
/// Without a separate gate a correct artist rescues a wrong song: searching for
/// Arijit Singh's "Sitaare" returns his "Saware", and a single blended score
/// reads that as a pass because half of it — the artist half — is perfect. The
/// artist is the weaker signal here anyway; these tracks routinely list two or
/// three collaborators in an order nobody agrees on.
const TITLE_GATE = 0.6

/// When the target artist is known, the result must share at least ONE name
/// token with it.
///
/// Not a score threshold — a presence check. Common titles are the failure mode
/// a title gate cannot see: "Wishes" by Hasan Raheem and "WISHES" by an
/// unrelated artist both score a perfect 1.00 on title. Zero shared artist
/// tokens means a different release, full stop. The bar stays at "one token"
/// because these credits legitimately disagree — a track billed here as two
/// names is often listed by the store as four, in another order.
const ARTIST_FLOOR = 0

/// Trailing qualifiers a store appends to a track name. Stripped before the
/// title comparison so "Kesariya (From "Brahmastra")" scores against "Kesariya"
/// rather than being diluted by words the query was never going to contain.
const TITLE_QUALIFIER = /\s*[([]\s*(from|with|feat\.?|featuring|prod\.?|original|remastered)\b[^)\]]*[)\]]/gi

function bareTitle(value: string): string {
  return value.replace(TITLE_QUALIFIER, ' ').replace(/\s+/g, ' ').trim()
}

type ItunesResult = {
  trackName?: string
  artistName?: string
  collectionName?: string
  releaseDate?: string
  primaryGenreName?: string
  trackTimeMillis?: number
  artworkUrl100?: string
  trackId?: number
}

/// Apple serves artwork from a path segment that encodes the size, so a bigger
/// image is a string substitution rather than a second request.
function upscaleArtwork(url: string | undefined, size: number): string | null {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`)
}

async function searchOnce(query: string, country: string): Promise<ItunesResult[]> {
  await throttle()

  const url = new URL(ITUNES_ENDPOINT)
  url.searchParams.set('term', query)
  url.searchParams.set('entity', 'song')
  url.searchParams.set('country', country)
  url.searchParams.set('limit', '10')

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`iTunes returned ${response.status} for "${query}"`)

  const body = (await response.json()) as { results?: ItunesResult[] }
  return body.results ?? []
}

/// What the result is scored against. Scored against the track's OWN
/// title/artist rather than the query that found it — otherwise a narrow query
/// like "Barbaad" scores a perfect 1.0 against any song of that name, which is
/// exactly the false positive worth avoiding.
export type MatchTarget = { title: string; artist: string | null; album?: string | null }

/// Collection suffixes that carry no identifying information. Stripped before
/// the album comparison so "Saiyaara (Original Motion Picture Soundtrack)"
/// compares as "Saiyaara".
const ALBUM_QUALIFIER =
  /\s*[([]\s*(original motion picture soundtrack|original soundtrack|extended album|deluxe|remastered)[^)\]]*[)\]]|\s+-\s+(single|ep)\s*$/gi

function bareAlbum(value: string): string {
  return value.replace(ALBUM_QUALIFIER, ' ').replace(/\s+/g, ' ').trim()
}

/// A track title that names its film: `Kesariya (From "Brahmastra")`. Apple
/// uses this form for a track lifted out of a soundtrack, and it is the
/// stronger of the two signals — the film is stated outright rather than
/// inferred from the collection it happens to sit in.
const TITLE_FROM_FILM = /[([]\s*from\s*["“'‘]?([^"”'’)\]]+)["”'’]?\s*[)\]]/i

/// A collection that says it IS a film soundtrack. Only the phrasings that name
/// a picture count: "Deluxe" or "Remastered" mark an edition, not a film, so a
/// pop album never reads as one.
///
/// Two forms, because the store uses both — bracketed
/// ("Saiyaara (Original Motion Picture Soundtrack)") and a bare trailing
/// qualifier ("Brahmastra Original Motion Picture Soundtrack"). The bare form
/// is anchored to the end so "Soundtrack Hits of the 90s" isn't read as a film.
const SOUNDTRACK_COLLECTION =
  /[([]\s*(original\s+)?(motion\s+picture\s+soundtrack|motion\s+picture|soundtrack)[^)\]]*[)\]]|\s*[-–—]?\s*(original\s+)?(motion\s+picture\s+soundtrack|motion\s+picture|soundtrack)\s*$/i

/// The film a store result is from, or null when nothing said it is from one.
///
/// Deliberately signal-driven rather than "the collection name is probably the
/// film". Most of this catalog is Bollywood, where the soundtrack IS the album
/// and the two names coincide — but an indie single's collection is not a film,
/// and there is no way to tell the difference from the string alone. So a film
/// is only reported when the store marked it as one, and a wrong null is left
/// for a human to fill in rather than a wrong film being written for them.
export function detectFilm(trackName: string, collectionName: string | null): string | null {
  const fromTitle = trackName.match(TITLE_FROM_FILM)?.[1]?.trim()
  // "From "Brahmastra"" beats the collection even when both are present: a
  // compilation carries the qualifier while its collection name is something
  // like "Bollywood Hits 2022".
  if (fromTitle) return fromTitle || null

  if (collectionName && SOUNDTRACK_COLLECTION.test(collectionName)) {
    // The qualifier is what identified it, so what is left is the film. Both
    // strippers run: this pattern is wider than ALBUM_QUALIFIER (which only
    // knows the two "original …" phrasings), and bareAlbum still has a trailing
    // "- Single"/"- EP" to take off.
    return bareAlbum(collectionName.replace(SOUNDTRACK_COLLECTION, ' ')) || null
  }

  return null
}

/// Try each candidate query, keep the single best-scoring result across all of
/// them, and stop early once one is comfortably good.
export async function lookupItunes(
  queries: string[],
  target: MatchTarget,
  artworkSize: number,
  country: string,
): Promise<ItunesMatch | null> {
  let best: ItunesMatch | null = null

  for (const query of queries) {
    let results: ItunesResult[]
    try {
      results = await searchOnce(query, country)
    } catch {
      // A single failed query is not fatal — the next candidate may still land.
      continue
    }

    for (const result of results) {
      if (!result.trackName || !result.artistName) continue

      const titleScore = similarity(bareTitle(target.title), bareTitle(result.trackName))
      const artistScore = target.artist ? similarity(target.artist, result.artistName) : 0

      // The album is a tie-break, not a gate. A store lists the same recording
      // on the film soundtrack AND on a dozen compilations, all with an equally
      // valid title and artist — so without this the winner is whichever the
      // search happened to rank first, and the cover ends up being some
      // greatest-hits sleeve instead of the film's. Never gated on, because a
      // genuinely single-release track has no album to agree with.
      const albumScore =
        target.album && result.collectionName
          ? similarity(bareAlbum(target.album), bareAlbum(result.collectionName))
          : 0

      // A failed gate scores zero rather than a low number: it must never beat
      // a weaker-but-honest match found by another query.
      const gated =
        titleScore < TITLE_GATE || (target.artist !== null && artistScore <= ARTIST_FLOOR)

      // Title-dominant either way. The album's weight is redistributed rather
      // than left at zero when there is nothing to compare, so that a track with
      // no known album can still reach the same score as one that matched — and
      // so the early exit below stays reachable for both.
      const raw = target.album
        ? titleScore * 0.6 + artistScore * 0.2 + albumScore * 0.2
        : titleScore * 0.75 + artistScore * 0.25

      const score = gated ? 0 : raw

      if (best && score <= best.score) continue

      const year = result.releaseDate ? Number(result.releaseDate.slice(0, 4)) : null

      best = {
        title: result.trackName,
        artist: result.artistName,
        album: result.collectionName ?? null,
        movie: detectFilm(result.trackName, result.collectionName ?? null),
        year: Number.isFinite(year) ? year : null,
        genre: result.primaryGenreName ?? null,
        durationMs: result.trackTimeMillis ?? null,
        artworkUrl: upscaleArtwork(result.artworkUrl100, artworkSize),
        trackId: result.trackId ?? null,
        score,
        titleScore,
        artistScore,
        albumScore,
        query,
      }
    }

    if (best && best.score >= 0.85) break
  }

  // A best-of-zero means every candidate failed the title gate. Report it as no
  // match at all rather than handing back a result the caller might trust.
  return best && best.score > 0 ? best : null
}

export async function downloadArtwork(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`artwork fetch returned ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/// iTunes Search API lookup for a YouTube video.
///
/// The hard part is not the request, it is the query. A playlist row arrives as
/// a video title and a channel name:
///
///   "Maahi Ve - Full Video | Shah Rukh Khan | Saif Ali | Preity | Udit Narayan | Kal Ho Naa Ho"
///   channel: "Sony Music India"
///
/// Sent to the store verbatim that returns zero results, and the channel is a
/// record label rather than a performer, so any check that demands the channel
/// name appear in the store's artist field fails on every Bollywood upload
/// there is. Both were true of the previous implementation, which is why an
/// entire playlist came back as "no iTunes match".
///
/// So: the title is decorated noise around a song name, and everything after
/// the song name — film, cast, playback singers — is EVIDENCE rather than
/// noise. This module strips the decoration, treats the first segment as the
/// song name, and scores candidate store results against the rest of the
/// title. The channel is only used as an artist signal when it is not a label.
///
/// The other failure mode is Apple's rate limit. It is undocumented, sits
/// somewhere near 20 requests/minute per address, and answers 403 — not 429 —
/// once tripped, for a cooldown window that outlasts a single retry. A bulk
/// import of a few hundred songs trips it within seconds. Treating that 403 as
/// "this song is not in the store" is what made the failure look permanent, so
/// a throttled, backing-off, self-healing client is part of the fix rather than
/// a nicety, and a lookup that genuinely could not be performed is reported as
/// its own outcome instead of being flattened into "no match".

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export type ItunesTrack = {
  trackName: string
  artistName: string
  /// The literal store collection, noise and all ("Kal Ho Naa Ho (Original
  /// Motion Picture Soundtrack)").
  collectionName: string | null
  /// Bare film title, and only when the store said this is a film track. See
  /// detectFilm — never a guess.
  movie: string | null
  releaseYear: number | null
  durationMs: number | null
  genre: string | null
  /// 600×600 cover art, derived from the 100×100 URL by string substitution.
  artworkUrl: string | null
  trackId: number | null
  /// Blended 0-1 confidence, and the title component on its own.
  score: number
  titleScore: number
  /// True when the match cleared the accept bar but not by much — worth an
  /// admin's eye rather than silent trust.
  lowConfidence: boolean
}

/// Three outcomes, deliberately distinct.
///
/// `no_match` is a fact about the catalog: the store was asked and has nothing
/// close. `lookup_failed` is a fact about the request: the store was never
/// successfully asked, so the same song may well match on a later attempt.
/// Collapsing the second into the first is the bug this type exists to prevent.
export type ItunesLookup =
  | { status: 'matched'; track: ItunesTrack }
  | { status: 'no_match' }
  | { status: 'lookup_failed'; reason: 'rate_limited' | 'network' }

// ---------------------------------------------------------------------------
// Turning a video title into a song name plus evidence
// ---------------------------------------------------------------------------

/// Parenthesised or bracketed decoration a music channel leaves behind.
const BRACKETED_NOISE =
  /[([{]\s*(official|full|lyric|lyrical|lyrics|with\s+lyrics|music|audio|video|hd|4k|8k|visualizer|visualiser|slowed|reverb|remix|teaser|trailer|promo|out\s+now|best|prod\.?[^)\]}]*)[^)\]}]*[)\]}]/gi

/// The same decoration unbracketed, wherever it appears once the brackets are
/// gone. Ordered longest-first so "full video song" is consumed whole rather
/// than leaving "song" behind.
/// `video` and `audio` are listed bare as well as in phrases, because a channel
/// will write `"Chammak Challo Full Song" Video "Ra One"` and the leftover word
/// glues the song name to the film — which pushes the title comparison under
/// its gate and loses an otherwise perfect match. `song` is deliberately NOT
/// bare: "Barbaad Song | Saiyaara" is the same shape, but a bare "song" is far
/// likelier to belong to a real title than a bare "video" is.
const BARE_NOISE =
  /\b(official\s+(music\s+)?video|official\s+audio|full\s+video(\s+song)?|full\s+audio|video\s+song|full\s+song|audio\s+song|best\s+video|title\s+(track|song)|with\s+lyrics?|lyric(s|al)?\s+video|lyric(s|al)|music\s+video|out\s+now|official|video|audio|4k|8k|hd)\b/gi

/// A "@handle" pasted at the front of a title, sometimes with its own dash.
const LEADING_HANDLE = /^\s*@\S+\s*[-–—|:]?\s*/

/// Pipes, bullets, spaced dashes and colons all separate a Bollywood video
/// title into song / film / cast / singers. The colon is included because
/// "Full Song: Mere Sohneya" is a common shape, and stripping the noise phrase
/// out of it would otherwise leave a leading ": ".
const SEPARATORS = /\s*[|•]\s*|\s+[-–—]\s+|\s*:\s*/

/// Punctuation left stranded at either end once phrases have been removed.
const EDGE_JUNK = /^[\s\-–—|:,."'“”‘’()[\]]+|[\s\-–—|:,."'“”‘’([]+$/g

/// Strip a channel's decoration from a video title. Returns the bare phrase;
/// splitting it into song and evidence is the separate, lossier step below.
export function cleanVideoTitle(raw: string): string {
  return raw
    .replace(LEADING_HANDLE, '')
    .replace(BRACKETED_NOISE, ' ')
    .replace(BARE_NOISE, ' ')
    // Brackets emptied by the substitutions above.
    .replace(/[([{]\s*[)\]}]/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/["“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(EDGE_JUNK, '')
    .trim()
}

function titleSegments(raw: string): string[] {
  return cleanVideoTitle(raw)
    .split(SEPARATORS)
    .map((segment) => cleanVideoTitle(segment))
    .filter((segment) => segment.length >= 2)
}

/// Channels that are labels, aggregators or topic feeds — never the performer.
///
/// The point of the list is the *negative*: with no way to tell a label from an
/// artist, either the channel has to be trusted as the artist (which fails for
/// every major-label upload) or ignored entirely (which throws away the signal
/// for a self-published "Anuv Jain" channel). This keeps the signal where it is
/// real. Matching is deliberately broad — a channel is far more likely to be a
/// label than to be an artist whose name contains "Records" or "Music".
const LABEL_CHANNEL =
  /\b(t-?series|sony\s+music|zee\s+music|yrf|saregama|tips|shemaroo|venus|eros|speed\s+records|times\s+music|universal\s+music|warner\s+music|vevo|records?|record\s+label|music\s+company|entertainment|hits|topic|films?|movies|studios|official|india|bollywood|music)\b/i

function isLabelChannel(channel: string): boolean {
  return channel.trim().length === 0 || LABEL_CHANNEL.test(channel)
}

/// Store queries for one video, best guess first.
///
/// The song name alone is the strongest query — narrow enough that the store
/// ranks the real track highly, and free of the cast names that sink a longer
/// term. The rest exist because the song is not always first: an upload titled
/// "Ajay-Atul - Gun Gun Guna" leads with the composer, so the second segment
/// gets its own turn.
function candidateQueries(videoTitle: string, channel: string): string[] {
  const segments = titleSegments(videoTitle)
  const song = segments[0] ?? cleanVideoTitle(videoTitle)
  const queries: string[] = []

  const push = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length >= 2 && !queries.includes(trimmed)) queries.push(trimmed)
  }

  push(song)
  // Song plus film disambiguates a common name ("Maahi Ve" exists twice).
  if (segments[1]) push(`${song} ${segments[1]}`)
  if (segments[1]) push(segments[1])
  if (!isLabelChannel(channel)) push(`${song} ${channel}`)

  // Last resort: the first couple of words. A separator is not guaranteed —
  // "Ranjha Full Song (audio) Queen | Amit Trivedi" leaves the film glued to
  // the song once the noise between them is stripped, and the store finds
  // nothing for "Ranjha Queen". Deliberately last: it is the broadest query
  // here, and it only costs a request on songs everything else already missed.
  const words = song.split(' ')
  if (words.length >= 3) push(words.slice(0, 2).join(' '))

  // Five is the ceiling on purpose: every extra candidate is another request
  // against a ~20/minute budget shared by the whole import. Nothing past the
  // first is reached unless the ones before it came back empty.
  return queries.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length > 1))
}

/// Dice coefficient over word tokens.
///
/// Not edit distance: the query and the result routinely disagree on word order
/// and on how many collaborating singers are credited, and edit distance
/// punishes both heavily. Shared-token overlap does not.
function similarity(a: string, b: string): number {
  const left = tokenize(a)
  const right = tokenize(b)
  if (left.size === 0 || right.size === 0) return 0

  let shared = 0
  for (const token of left) if (right.has(token)) shared++
  return (2 * shared) / (left.size + right.size)
}

/// How much of `needle` appears in `haystack`, ignoring what else the haystack
/// contains.
///
/// Asymmetric on purpose, and the reason artist evidence works at all: the
/// haystack here is the whole remainder of a video title — film, five actors,
/// three singers — so a symmetric measure would score a correct two-name artist
/// credit near zero simply because the title says so much more.
function coverage(needle: string, haystack: string): number {
  const wanted = tokenize(needle)
  const available = tokenize(haystack)
  if (wanted.size === 0) return 0

  let shared = 0
  for (const token of wanted) if (available.has(token)) shared++
  return shared / wanted.size
}

/// Trailing qualifiers the store appends to a track name. Stripped before the
/// title comparison so `Kesariya (From "Brahmastra")` is scored as "Kesariya"
/// rather than diluted by words the video title was never going to contain.
const TITLE_QUALIFIER =
  /\s*[([]\s*(from|with|feat\.?|featuring|prod\.?|original|remastered|lyrical|video|male|female|reprise)\b[^)\]]*[)\]]/gi

function bareTitle(value: string): string {
  return value.replace(TITLE_QUALIFIER, ' ').replace(/\s+/g, ' ').trim()
}

const ALBUM_QUALIFIER =
  /\s*[([]\s*(original motion picture soundtrack|original soundtrack|extended album|deluxe|remastered)[^)\]]*[)\]]|\s+-\s+(single|ep)\s*$/gi

function bareAlbum(value: string): string {
  return value.replace(ALBUM_QUALIFIER, ' ').replace(/\s+/g, ' ').trim()
}

/// A track title that names its film: `Kesariya (From "Brahmastra")`.
const TITLE_FROM_FILM = /[([]\s*from\s*["“'‘]?([^"”'’)\]]+)["”'’]?\s*[)\]]/i

/// A collection that says it IS a film soundtrack. Only phrasings that name a
/// picture count — "Deluxe" marks an edition, not a film.
const SOUNDTRACK_COLLECTION =
  /[([]\s*(original\s+)?(motion\s+picture\s+soundtrack|motion\s+picture|soundtrack)[^)\]]*[)\]]|\s*[-–—]?\s*(original\s+)?(motion\s+picture\s+soundtrack|motion\s+picture|soundtrack)\s*$/i

/// The film a store result is from, or null when nothing said it is from one.
///
/// Signal-driven rather than "the collection is probably the film". Most of this
/// catalog is Bollywood, where the soundtrack IS the album and the two names
/// coincide — but an indie single's collection is not a film, and the string
/// alone cannot tell the difference. A wrong null is left for a human to fill
/// in rather than a wrong film being written for them. Mirrors detectFilm in
/// scripts/lib/metadata.ts, which does the same job for local masters.
export function detectFilm(trackName: string, collectionName: string | null): string | null {
  const fromTitle = trackName.match(TITLE_FROM_FILM)?.[1]?.trim()
  // The qualifier beats the collection even when both are present: a
  // compilation carries `(From "…")` while its collection is "Bollywood Hits".
  if (fromTitle) return fromTitle || null

  if (collectionName && SOUNDTRACK_COLLECTION.test(collectionName)) {
    return bareAlbum(collectionName.replace(SOUNDTRACK_COLLECTION, ' ')) || null
  }

  return null
}

/// An alternate cut the store lists alongside the original. Matching one of
/// these when the video title never asked for it is worse than it looks: the
/// duration comes back wrong, and duration is what the reveal ladder and the
/// detected hook are measured against.
const ALTERNATE_CUT =
  /\b(remix|instrumental|karaoke|cover|live|reprise|unplugged|lo-?fi|slowed|reverb|mix|version|female|male|duet|acoustic|extended|radio\s+edit)\b/i

/// Small enough to be a tie-break rather than a veto — when the original is
/// present it wins, and when the store only carries the alternate cut it is
/// still better than nothing.
const ALTERNATE_CUT_PENALTY = 0.05

/// The title must clear this ON ITS OWN, however well the rest corroborates.
///
/// Without a separate gate, strong artist evidence rescues a wrong song:
/// searching Arijit Singh's "Sitaare" returns his "Saware", and a single
/// blended score reads that as a pass because the artist half is perfect.
const TITLE_GATE = 0.6

/// Below this the blended score is not a match at all.
///
/// Calibrated against the weights below: a perfect title with zero
/// corroboration scores exactly 0.60 and is accepted — the common case of a
/// clean song name whose singers the video title never listed. A half-matching
/// title with nothing backing it scores 0.36 and is not.
const ACCEPT_SCORE = 0.5

/// Accepted, but flagged for review rather than trusted outright.
const CONFIDENT_SCORE = 0.62

/// One good result ends the search early rather than spending the remaining
/// candidates — and with them, the rate-limit budget — on confirming it.
const GOOD_ENOUGH_SCORE = 0.72

// ---------------------------------------------------------------------------
// Throttled, self-healing store client
// ---------------------------------------------------------------------------

type ItunesResult = {
  wrapperType?: string
  kind?: string
  trackName?: string
  artistName?: string
  collectionName?: string
  releaseDate?: string
  trackTimeMillis?: number
  primaryGenreName?: string
  artworkUrl100?: string
  trackId?: number
}

const ITUNES_ENDPOINT = 'https://itunes.apple.com/search'

/// Which store front to search. This catalog is Hindi film music, which the
/// Indian store indexes best; override for a differently-shaped catalog.
const COUNTRY = process.env.ITUNES_COUNTRY?.trim() || 'IN'

/// Apple asks for no more than ~20 calls/minute from one address.
const BASE_SPACING_MS = 3_000

/// Ceiling for the adaptive spacing. Past this the import is slower than the
/// admin will wait for, and a longer pause is not buying anything back.
const MAX_SPACING_MS = 20_000

/// Attempts per query before giving up and reporting the lookup as failed.
const MAX_ATTEMPTS = 3

/// Current spacing between requests, raised on a 403 and decayed on success.
///
/// Adaptive rather than fixed because the real limit is unpublished and moves:
/// a fixed spacing is either too slow for every import or too fast for the one
/// that trips the limit. Module-level so that concurrent imports share one
/// budget — per-request state would let two songs burst in parallel and trip
/// the very limit this exists to respect.
let spacingMs = BASE_SPACING_MS
let lastRequestAt = 0
let consecutiveOk = 0

/// Serialises every request through one chain. Without this, two songs
/// importing at once each read `lastRequestAt` before the other writes it and
/// both fire immediately, which is precisely how the limit gets tripped.
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task)
  // Keep the chain alive after a rejection so one failure cannot wedge the
  // queue for every later song.
  queue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

class RateLimited extends Error {}

/// Results are cached for the life of the process: a playlist routinely lists
/// the same song twice, re-imports repeat the same queries, and the cheapest
/// request against a 20/minute budget is the one not made. Capped so a
/// long-lived server cannot grow it without bound.
const CACHE_LIMIT = 500
const cache = new Map<string, ItunesResult[]>()

function cacheGet(key: string): ItunesResult[] | undefined {
  return cache.get(key)
}

function cacheSet(key: string, value: ItunesResult[]): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/// One store query, throttled and retried. Throws RateLimited when Apple keeps
/// refusing, so the caller can tell that apart from an honest empty result.
async function searchOnce(term: string): Promise<ItunesResult[]> {
  const key = `${COUNTRY}:${term.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached) return cached

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const results = await enqueue(async () => {
      const wait = lastRequestAt + spacingMs - Date.now()
      if (wait > 0) await sleep(wait)
      lastRequestAt = Date.now()

      const url = new URL(ITUNES_ENDPOINT)
      url.searchParams.set('term', term)
      url.searchParams.set('media', 'music')
      url.searchParams.set('entity', 'song')
      url.searchParams.set('country', COUNTRY)
      // 25 rather than 5: the right track is often not the store's first hit
      // for a bare song name, and scoring a deeper page costs no extra request.
      url.searchParams.set('limit', '25')

      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })

      // Apple answers 403 for a rate limit, not 429 — treat both as one.
      if (response.status === 403 || response.status === 429) {
        consecutiveOk = 0
        spacingMs = Math.min(Math.round(spacingMs * 1.5), MAX_SPACING_MS)
        throw new RateLimited(`iTunes rate limited (${response.status})`)
      }
      if (!response.ok) throw new Error(`iTunes returned ${response.status}`)

      const body = (await response.json()) as { results?: ItunesResult[] }

      // Ease back toward the base spacing once the store is clearly happy, so
      // one throttled import does not leave every later one crawling.
      consecutiveOk++
      if (consecutiveOk >= 5 && spacingMs > BASE_SPACING_MS) {
        spacingMs = Math.max(BASE_SPACING_MS, Math.round(spacingMs / 1.5))
        consecutiveOk = 0
      }

      return body.results ?? []
    }).catch(async (error: unknown) => {
      if (error instanceof RateLimited) {
        // Cool down OUTSIDE the queue: holding the lock would stall every
        // other song behind this one for the whole window.
        await sleep(5_000 * (attempt + 1))
        return null
      }
      throw error
    })

    if (results) {
      cacheSet(key, results)
      return results
    }
  }

  throw new RateLimited('iTunes rate limited after retries')
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/// Apple serves artwork from a path segment encoding the size, so a bigger
/// image is a string substitution rather than a second request.
function upscaleArtwork(url: string | undefined, size = 600): string | null {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`)
}

function buildTrack(result: ItunesResult, score: number, titleScore: number): ItunesTrack {
  const year = result.releaseDate ? Number(result.releaseDate.slice(0, 4)) : null
  const collectionName = result.collectionName ?? null

  return {
    trackName: result.trackName ?? '',
    artistName: result.artistName ?? '',
    collectionName,
    movie: detectFilm(result.trackName ?? '', collectionName),
    releaseYear: Number.isFinite(year) ? year : null,
    durationMs: result.trackTimeMillis ?? null,
    genre: result.primaryGenreName ?? null,
    artworkUrl: upscaleArtwork(result.artworkUrl100),
    trackId: result.trackId ?? null,
    score,
    titleScore,
    // An exact title on its own is deliberately NOT enough to count as
    // confident. It is the signature of the one case nothing else here can
    // resolve: a title common to the original and to every cover of it, with no
    // film and no singer to say which one this is. Flagging it costs an admin a
    // glance; not flagging it puts a 2025 bedroom cover in the catalog as a 2011
    // film song.
    lowConfidence: score < CONFIDENT_SCORE,
  }
}

/// Find the store's best match for a YouTube video.
///
/// `videoTitle` is the raw video title — pass it undecorated, the cleaning
/// happens here. `channelTitle` is used as an artist signal only when it is not
/// a record label.
export async function lookupItunes(
  videoTitle: string,
  channelTitle: string,
): Promise<ItunesLookup> {
  const segments = titleSegments(videoTitle)

  /// What the store's track name is compared against, each with the weight its
  /// title score earns.
  ///
  /// The song name is usually the first segment and occasionally the second —
  /// see candidateQueries — so both are scored at full weight and whichever
  /// fits a given store result better is the one that counts. The leading two
  /// words are scored too, at a discount, for the glued case: when no separator
  /// divides song from film, the full segment can only ever reach ~0.67 against
  /// the store's bare track name, and a fraction of that does not clear the
  /// gate. The discount is what keeps this from being a hole in the gate — a
  /// truncated hit has to be corroborated by the film or the singers to pass,
  /// where a full-segment hit stands on its own.
  const songCandidates: Array<{ text: string; weight: number }> = segments
    .slice(0, 2)
    .map((text) => ({ text, weight: 1 }))

  if (songCandidates.length === 0) {
    songCandidates.push({ text: cleanVideoTitle(videoTitle) || videoTitle, weight: 1 })
  }

  const leadWords = (segments[0] ?? '').split(' ')
  if (leadWords.length >= 3) {
    songCandidates.push({ text: leadWords.slice(0, 2).join(' '), weight: 0.85 })
  }

  /// Film evidence is the WHOLE cleaned title, song name included, because a
  /// separator between song and film is not guaranteed: `"Chammak Challo Full
  /// Song" Video "Ra One"` cleans down to one segment holding both. Excluding
  /// that segment would discard the film evidence in precisely the case that
  /// depends on it.
  const filmEvidence = segments.join(' ')

  let best: { result: ItunesResult; score: number; titleScore: number } | null = null
  let rateLimited = false
  let networkFailed = false

  for (const term of candidateQueries(videoTitle, channelTitle)) {
    let results: ItunesResult[]
    try {
      results = await searchOnce(term)
    } catch (error) {
      // One failed candidate is not fatal — a later one may still land. What
      // matters is remembering WHY, so an empty result set can be reported
      // honestly at the end.
      if (error instanceof RateLimited) rateLimited = true
      else networkFailed = true
      continue
    }

    for (const [index, result] of results.entries()) {
      if (result.wrapperType && result.wrapperType !== 'track') continue
      if (result.kind && result.kind !== 'song') continue
      if (!result.trackName || !result.artistName) continue

      let titleScore = 0
      let matchedAs = ''
      for (const candidate of songCandidates) {
        const score =
          similarity(bareTitle(candidate.text), bareTitle(result.trackName)) * candidate.weight
        if (score > titleScore) {
          titleScore = score
          matchedAs = candidate.text
        }
      }
      if (titleScore < TITLE_GATE) continue

      // Artist evidence, unlike film evidence, EXCLUDES whatever matched the
      // song name. Playback singers are credited in their own segment, so
      // nothing is lost — and leaving the song name in actively misleads: a
      // search for "Ranjha" surfaces an unrelated "Queen" by an artist named
      // "Veen Ranjha", whose credit then appears to be corroborated by the very
      // word that found it.
      const artistEvidence = segments.filter((segment) => segment !== matchedAs).join(' ')

      const artistScore = Math.max(
        artistEvidence ? coverage(result.artistName, artistEvidence) : 0,
        isLabelChannel(channelTitle) ? 0 : similarity(result.artistName, channelTitle),
      )

      // The film is corroboration, not a gate: the same recording sits on the
      // soundtrack and on a dozen compilations, all with an equally valid title
      // and artist, so without this the winner is whichever the store happened
      // to rank first.
      //
      // A single's collection is skipped rather than scored. "Daru Desi -
      // Single" bares down to "Daru Desi", which trivially matches the film
      // evidence BECAUSE the evidence contains the song name — handing every
      // single-release cover a free corroboration bonus it did nothing to earn.
      // That is how an obscure 2025 upload of a Bollywood title outscored the
      // original. A collection that merely restates the track name carries no
      // information either way.
      const collection = result.collectionName ? bareAlbum(result.collectionName) : ''
      const collectionIsSingle =
        collection.length === 0 ||
        similarity(collection, bareTitle(result.trackName)) >= 0.8

      const filmScore =
        filmEvidence && !collectionIsSingle ? coverage(collection, filmEvidence) : 0

      // The store's own ranking is a popularity prior, and a useful one for
      // exactly the case the other signals cannot separate: a famous original
      // and an unknown cover of the same name score identically on title, and
      // neither has a film to corroborate. Small enough to only break ties.
      const rankBonus = (1 - index / results.length) * 0.05

      // Only penalised when the video title did not ask for the alternate cut —
      // an upload that says "Female Version" should match the female version.
      const unwantedCut =
        ALTERNATE_CUT.test(result.trackName) && !ALTERNATE_CUT.test(filmEvidence)

      const score =
        titleScore * 0.6 +
        artistScore * 0.25 +
        filmScore * 0.15 +
        rankBonus -
        (unwantedCut ? ALTERNATE_CUT_PENALTY : 0)

      if (!best || score > best.score) best = { result, score, titleScore }
    }

    if (best && best.score >= GOOD_ENOUGH_SCORE) break
  }

  if (best && best.score >= ACCEPT_SCORE) {
    return { status: 'matched', track: buildTrack(best.result, best.score, best.titleScore) }
  }

  // Nothing landed AND at least one query never got an answer: the store was
  // never really asked, so this is not evidence the song is absent.
  if (rateLimited) return { status: 'lookup_failed', reason: 'rate_limited' }
  if (networkFailed) return { status: 'lookup_failed', reason: 'network' }

  return { status: 'no_match' }
}

/// Best-effort song title and artist from a video title alone, for when the
/// store has nothing. The song name is the first segment; the artist is left to
/// the caller's fallback (usually the channel) because a video title lists cast
/// and singers together with no way to tell which is which.
export function guessSongTitle(videoTitle: string): string {
  const segments = titleSegments(videoTitle)
  return segments[0] ?? cleanVideoTitle(videoTitle) ?? videoTitle
}

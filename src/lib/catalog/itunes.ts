import axios from 'axios'

export type ItunesTrack = {
  trackName: string
  artistName: string
  collectionName: string | null  // album
  releaseYear: number | null
  durationMs: number | null
  genre: string | null
  /** 100×100 artwork URL; replace "100x100" with a larger size if needed. */
  artworkUrl: string | null
}

type ItunesResult = {
  wrapperType?: string
  kind?: string
  trackName?: string
  artistName?: string
  collectionName?: string
  releaseDate?: string            // ISO date
  trackTimeMillis?: number
  primaryGenreName?: string
  artworkUrl100?: string
}

type ItunesResponse = {
  resultCount: number
  results: ItunesResult[]
}

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')          // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Loose match: at least half of the query title's significant words must
 * appear in the iTunes track name, and the artist names must share at least
 * one meaningful word.
 */
function isGoodMatch(queryTitle: string, queryArtist: string, result: ItunesResult): boolean {
  const resultTitle = result.trackName
  const resultArtist = result.artistName
  if (!resultTitle || !resultArtist) return false

  const t1 = normalizeStr(queryTitle)
  const t2 = normalizeStr(resultTitle)
  const a1 = normalizeStr(queryArtist)
  const a2 = normalizeStr(resultArtist)

  // Significant words: 3+ characters (skip "the", "a", "is", etc.)
  const sig = (s: string) => s.split(' ').filter((w) => w.length >= 3)

  const titleWords = sig(t1)
  // At least half of query title words present in the result title
  const titleHits = titleWords.filter((w) => t2.includes(w)).length
  const titleOk = titleWords.length === 0 || titleHits / titleWords.length >= 0.5

  // At least one significant artist word matches
  const artistWords1 = sig(a1)
  const artistWords2 = sig(a2)
  const artistOk =
    artistWords1.some((w) => a2.includes(w)) ||
    artistWords2.some((w) => a1.includes(w))

  return titleOk && artistOk
}

/**
 * Search iTunes Search API for the best matching track.
 * Returns null if no sufficiently close match is found.
 * No API key required — the iTunes Search API is free and open.
 */
export async function searchItunes(
  title: string,
  artist: string,
): Promise<ItunesTrack | null> {
  const term = `${title} ${artist}`

  let response: { data: ItunesResponse }
  try {
    response = await axios.get<ItunesResponse>('https://itunes.apple.com/search', {
      params: {
        term,
        media: 'music',
        entity: 'song',
        limit: 5,
      },
      timeout: 8_000,
    })
  } catch {
    // Network failure or timeout — treat as no match rather than a hard error.
    return null
  }

  const results = response.data.results ?? []

  for (const result of results) {
    if (result.wrapperType !== 'track' || result.kind !== 'song') continue
    if (!isGoodMatch(title, artist, result)) continue

    const year = result.releaseDate ? new Date(result.releaseDate).getFullYear() : null

    return {
      trackName: result.trackName ?? title,
      artistName: result.artistName ?? artist,
      collectionName: result.collectionName ?? null,
      releaseYear: Number.isFinite(year) ? year : null,
      durationMs: result.trackTimeMillis ?? null,
      genre: result.primaryGenreName ?? null,
      artworkUrl: result.artworkUrl100?.replace('100x100', '600x600') ?? null,
    }
  }

  return null
}

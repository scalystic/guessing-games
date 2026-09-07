// A search client for the iTunes Store that survives a long run.
//
// The catalog cleanup scripts make ~100-200 sequential calls over several
// minutes, and across a window that long the store WILL drop a connection or
// answer 403 to a burst at least once. The first version of this had no retry
// and no timeout: one dropped socket at row 46 of 109 killed the process and
// took forty-five rows of results with it, because the output file was only
// written at the end.
//
// So: bounded timeout, retry with backoff, and an empty array rather than a
// throw once retries are spent. A row that could not be looked up is a row left
// alone, which is the same outcome as a row with no match — and both are
// recoverable by re-running, because nothing here writes anything.

export type ItunesResult = {
  trackName?: string
  artistName?: string
  collectionName?: string
  releaseDate?: string
  primaryGenreName?: string
  trackTimeMillis?: number
}

/// Per-attempt ceiling. The store normally answers in well under a second;
/// anything past ten is a socket that is not coming back.
const TIMEOUT_MS = 10_000

const MAX_ATTEMPTS = 3

/// Doubles per attempt. Long enough to outlast a rate-limit window without
/// stalling a 200-row run when the failure was just a dropped connection.
const BACKOFF_MS = 4_000

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/// Search the store. Returns [] on any failure the retries could not clear —
/// callers treat that identically to "no match", so a transient outage costs
/// coverage on a few rows rather than the whole run.
export async function searchItunes(
  term: string,
  country: string,
  limit = 12,
): Promise<ItunesResult[]> {
  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
    `&entity=song&country=${country}&limit=${limit}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'cluecade-catalog-cleanup' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      // 403 and 429 are the store's rate limiter. Worth waiting out; a 404 or a
      // 400 is a bad query and never becomes good.
      if (res.status === 403 || res.status === 429) {
        if (attempt === MAX_ATTEMPTS) return []
        await sleep(BACKOFF_MS * attempt)
        continue
      }
      if (!res.ok) return []

      const body = (await res.json()) as { results?: ItunesResult[] }
      return body.results ?? []
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`  itunes: giving up on "${term.slice(0, 50)}" — ${(error as Error).message}`)
        return []
      }
      await sleep(BACKOFF_MS * attempt)
    }
  }

  return []
}

/// Release year from the store's ISO timestamp, or null when it has none.
export function releaseYear(result: ItunesResult): number | null {
  if (!result.releaseDate) return null
  const year = new Date(result.releaseDate).getUTCFullYear()
  return Number.isFinite(year) ? year : null
}

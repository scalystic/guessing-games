import { getAdminUser } from '@/lib/admin/auth'
import { jsonError, jsonOk, internalErrorJson } from '@/lib/api/response'
import { prisma } from '@/lib/db'
import axios from 'axios'

export type YoutubeVideoItem = {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  position: number
  releaseYear: number | null   // from video publishedAt
  durationMs: number | null    // from contentDetails.duration
  genres: string[]             // from topicDetails.topicCategories
  existsInDb: boolean          // true if videoId already in catalog
}

function extractPlaylistId(input: string): string | null {
  try {
    const url = new URL(input.trim())
    const list = url.searchParams.get('list')
    if (list) return list
  } catch {
    // not a URL — check if it looks like a bare playlist ID
  }
  const bare = input.trim()
  if (/^[A-Za-z0-9_-]{10,}$/.test(bare)) return bare
  return null
}

type PlaylistItemsResponse = {
  nextPageToken?: string
  items: Array<{
    snippet?: {
      title?: string
      videoOwnerChannelTitle?: string
      position?: number
      thumbnails?: {
        maxres?: { url: string }
        high?: { url: string }
        medium?: { url: string }
        default?: { url: string }
      }
      resourceId?: { videoId?: string }
    }
  }>
}

type VideosResponse = {
  items: Array<{
    id?: string
    snippet?: {
      publishedAt?: string        // ISO date, e.g. "2021-05-15T10:00:00Z"
    }
    contentDetails?: {
      duration?: string           // ISO 8601, e.g. "PT3M45S"
      videoPublishedAt?: string   // original publish date on YouTube Music/VEVO
    }
    topicDetails?: {
      topicCategories?: string[]  // Wikipedia URLs
    }
  }>
}

function parseDurationMs(iso: string | undefined): number | null {
  if (!iso) return null
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/)
  if (!match) return null
  const h = parseFloat(match[1] ?? '0')
  const m = parseFloat(match[2] ?? '0')
  const s = parseFloat(match[3] ?? '0')
  const total = (h * 3600 + m * 60 + s) * 1000
  return total > 0 ? Math.round(total) : null
}

function yearFromDate(iso: string | undefined): number | null {
  if (!iso) return null
  const year = new Date(iso).getFullYear()
  return isFinite(year) ? year : null
}

// Map Wikipedia topic category URLs to simple genre names.
const TOPIC_GENRE_MAP: Record<string, string> = {
  Pop_music: 'Pop',
  Rock_music: 'Rock',
  Hip_hop_music: 'Hip-Hop',
  Electronic_music: 'Electronic',
  Jazz: 'Jazz',
  Classical_music: 'Classical',
  Country_music: 'Country',
  Soul_music: 'Soul',
  'R%26B_and_soul': 'R&B',
  Rhythm_and_blues: 'R&B',
  Folk_music: 'Folk',
  Indie_music: 'Indie',
  Alternative_rock: 'Alternative',
  Heavy_metal_music: 'Metal',
  Bollywood: 'Bollywood',
  Filmi: 'Bollywood',
  Disco: 'Disco',
  Reggae: 'Reggae',
  Blues: 'Blues',
  Punk_rock: 'Punk',
  Dance_music: 'Dance',
  Carnatic_music: 'Carnatic',
  Hindustani_classical_music: 'Hindustani',
}

function genresFromTopics(topics: string[] | undefined): string[] {
  if (!topics) return []
  const genres: string[] = []
  for (const url of topics) {
    const segment = url.split('/').pop() ?? ''
    const mapped = TOPIC_GENRE_MAP[segment]
    if (mapped && !genres.includes(mapped)) genres.push(mapped)
  }
  return genres.slice(0, 3)
}

// Fetch details for up to 50 video IDs per call. Returns a map videoId → details.
async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string,
): Promise<Map<string, { releaseYear: number | null; durationMs: number | null; genres: string[] }>> {
  const result = new Map<string, { releaseYear: number | null; durationMs: number | null; genres: string[] }>()
  if (videoIds.length === 0) return result

  // Batch into groups of 50 (YouTube API limit)
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)
    try {
      const response = await axios.get<VideosResponse>(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          params: {
            part: 'snippet,contentDetails,topicDetails',
            id: batch.join(','),
            key: apiKey,
          },
          timeout: 10_000,
        },
      )

      for (const item of response.data.items) {
        if (!item.id) continue
        // Prefer videoPublishedAt (original music release) over snippet.publishedAt (upload date)
        const dateStr = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt
        result.set(item.id, {
          releaseYear: yearFromDate(dateStr),
          durationMs: parseDurationMs(item.contentDetails?.duration),
          genres: genresFromTopics(item.topicDetails?.topicCategories),
        })
      }
    } catch {
      // Non-fatal: video details are enrichment, not required
    }
  }

  return result
}

async function fetchAllPlaylistItems(
  playlistId: string,
  apiKey: string,
): Promise<YoutubeVideoItem[]> {
  const items: YoutubeVideoItem[] = []
  let pageToken: string | undefined
  const MAX_ITEMS = 500

  do {
    const params: Record<string, string> = {
      part: 'snippet',
      playlistId,
      maxResults: '50',
      key: apiKey,
    }
    if (pageToken) params.pageToken = pageToken

    const response = await axios.get<PlaylistItemsResponse>(
      'https://www.googleapis.com/youtube/v3/playlistItems',
      { params, timeout: 10_000 },
    )

    for (const item of response.data.items) {
      const snippet = item.snippet
      if (!snippet) continue
      const videoId = snippet.resourceId?.videoId
      if (!videoId) continue
      const title = snippet.title ?? 'Unknown Title'
      if (title === 'Private video' || title === 'Deleted video') continue

      const thumbs = snippet.thumbnails
      const thumbnailUrl =
        thumbs?.maxres?.url ?? thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? ''

      items.push({
        videoId,
        title,
        channelTitle: snippet.videoOwnerChannelTitle ?? '',
        thumbnailUrl,
        position: snippet.position ?? items.length,
        releaseYear: null,
        durationMs: null,
        genres: [],
        existsInDb: false,
      })

      if (items.length >= MAX_ITEMS) break
    }

    pageToken = items.length < MAX_ITEMS ? response.data.nextPageToken : undefined
  } while (pageToken)

  // Enrich with video details (duration, year, genres)
  const videoIds = items.map((item) => item.videoId)
  const details = await fetchVideoDetails(videoIds, apiKey)

  for (const item of items) {
    const d = details.get(item.videoId)
    if (d) {
      item.releaseYear = d.releaseYear
      item.durationMs = d.durationMs
      item.genres = d.genres
    }
  }

  return items
}

/**
 * GET /api/admin/youtube/playlist?url=<playlist-url>
 *
 * Fetches all video metadata (including duration, release year, genres) from a
 * YouTube playlist using the Data API v3. Returns up to 200 items.
 * Requires YOUTUBE_API_KEY env var.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await getAdminUser()
  if (!admin) return jsonError(401, 'unauthorized', 'Admin sign-in required.')

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return jsonError(
      500,
      'no_api_key',
      'YOUTUBE_API_KEY is not configured. Add it to your .env file.',
    )
  }

  const url = new URL(request.url)
  const playlistUrl = url.searchParams.get('url') ?? ''
  if (!playlistUrl) return jsonError(400, 'missing_url', 'url query param is required.')

  const playlistId = extractPlaylistId(playlistUrl)
  if (!playlistId) {
    return jsonError(
      400,
      'invalid_url',
      'Could not extract a playlist ID from the URL. Make sure it contains ?list= or is a bare playlist ID.',
    )
  }

  try {
    const items = await fetchAllPlaylistItems(playlistId, apiKey)

    // Mark which videoIds already exist in the catalog so the UI can highlight
    // them and skip re-importing. Keyed by ingestRef = videoId.
    const videoIds = items.map((item) => item.videoId)
    const existing = await prisma.puzzle.findMany({
      where: { ingestSource: 'youtube', ingestRef: { in: videoIds } },
      select: { ingestRef: true },
    })
    const existingSet = new Set(existing.map((p) => p.ingestRef).filter(Boolean))
    for (const item of items) {
      item.existsInDb = existingSet.has(item.videoId)
    }

    // Also mark as existing if a song with the same title is already in the
    // catalog from any source — prevents duplicate entries across imports.
    const uncheckedTitles = items.filter((i) => !i.existsInDb).map((i) => i.title)
    if (uncheckedTitles.length > 0) {
      const songsByTitle = await prisma.song.findMany({
        where: { title: { in: uncheckedTitles, mode: 'insensitive' } },
        select: { title: true },
      })
      const existingTitleSet = new Set(songsByTitle.map((s) => s.title.toLowerCase()))
      for (const item of items) {
        if (!item.existsInDb && existingTitleSet.has(item.title.toLowerCase())) {
          item.existsInDb = true
        }
      }
    }

    return jsonOk({ items, playlistId })
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const message =
        (error.response?.data as { error?: { message?: string } })?.error?.message ??
        error.message
      if (status === 404) return jsonError(404, 'playlist_not_found', 'Playlist not found.')
      if (status === 403) return jsonError(403, 'api_forbidden', `YouTube API: ${message}`)
      return jsonError(502, 'youtube_api_error', `YouTube API error: ${message}`)
    }
    return internalErrorJson('youtube:playlist', error)
  }
}

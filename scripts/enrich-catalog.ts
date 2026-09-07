// Fill the gaps the deterministic pass could not — movie, releaseYear, album,
// genres — by asking the iTunes Search API about rows that are still missing
// one, then writing back only what the store actually confirmed.
//
//   npm run enrich:catalog                       # report only
//   npm run enrich:catalog -- --write            # apply
//   npm run enrich:catalog -- --out ./found.json
//
// Runs AFTER scripts/clean-catalog.ts, and depends on it having run: the query
// this sends is built from the cleaned title and artist, and searching the
// store for `Kesariya (From "Brahmastra")` finds noticeably less than searching
// for `Kesariya`.
//
// The rule this file exists to enforce is the one from scripts/lib/metadata.ts:
// a film is written ONLY when the store marked the track as being from one.
// Most of the rows missing a movie here are indie singles, English pop and
// Punjabi releases that are not from a film at all, and NULL is their correct
// value — so a match that does not name a film leaves the column alone rather
// than promoting a collection name into it.

import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { computeDecade } from '../src/lib/catalog/search-text'
import { deriveMovie, cleanSongTitle } from './lib/cleanup'
import { searchItunes, releaseYear, sleep, type ItunesResult } from './lib/itunes'

const { values } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    out: { type: 'string' },
    /// Apple rate-limits at roughly 20 calls/minute per address. 3s between
    /// calls keeps a 120-row run under that without needing backoff.
    delay: { type: 'string', default: '3000' },
  },
})

const DELAY_MS = Number(values.delay)

type Found = {
  puzzleId: string
  title: string
  artist: string
  query: string
  matched: { track: string; artist: string; collection: string | null } | null
  score: number
  filled: Record<string, unknown>
  skipped: string[]
}

/// Token overlap, weighted toward the title. Same shape as the ingest matcher:
/// a store search returns near-misses constantly ("Kal Ho Naa Ho (Sad
/// Version)"), and a row is only worth trusting when both halves agree.
function score(
  target: { title: string; artist: string },
  result: ItunesResult,
): number {
  const tokens = (v: string) =>
    new Set(
      v
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
    )

  const overlap = (a: Set<string>, b: Set<string>) => {
    if (!a.size || !b.size) return 0
    let hit = 0
    for (const t of a) if (b.has(t)) hit += 1
    return hit / Math.max(a.size, b.size)
  }

  // The store's track name still carries its `(From "…")` qualifier, which
  // would depress overlap against an already-cleaned title. Strip it the same
  // way before comparing so the two sides are in the same shape.
  const resultTitle = cleanSongTitle(result.trackName ?? '').title
  const titleScore = overlap(tokens(target.title), tokens(resultTitle))
  const artistScore = overlap(tokens(target.artist), tokens(result.artistName ?? ''))

  return titleScore * 0.75 + artistScore * 0.25
}

/// Below this, the match is not trusted and the row is left untouched. Set
/// high on purpose: a wrong film written into the catalog is worse than a null
/// one, because null is visibly missing and wrong is not.
const ACCEPT = 0.62

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const songs = await prisma.song.findMany({
    where: {
      OR: [
        { movie: null },
        { releaseYear: null },
        { album: null },
        { genres: { isEmpty: true } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`${songs.length} rows with at least one gap\n`)
  const found: Found[] = []

  for (const [i, song] of songs.entries()) {
    const query = `${song.title} ${song.artist}`.slice(0, 180)

    // Both storefronts, because the catalog straddles them: the Indian store
    // has the Bollywood soundtracks and the US store has the English and Latin
    // rows that the Indian one does not carry.
    let results = await searchItunes(query, 'IN')
    if (!results.length) {
      await sleep(DELAY_MS)
      results = await searchItunes(query, 'US')
    }

    let best: ItunesResult | null = null
    let bestScore = 0
    for (const r of results) {
      const s = score({ title: song.title, artist: song.artist }, r)
      if (s > bestScore) {
        bestScore = s
        best = r
      }
    }

    const filled: Record<string, unknown> = {}
    const skipped: string[] = []

    if (best && bestScore >= ACCEPT) {
      const collection = best.collectionName ?? null

      if (!song.movie) {
        // The store's own two film signals, and nothing else. A collection
        // that does not announce itself as a soundtrack yields null here,
        // which is the correct value for every non-film row in this set.
        const fromTitle = cleanSongTitle(best.trackName ?? '').movie
        const movie = deriveMovie(fromTitle, collection)
        if (movie) filled.movie = movie
        else skipped.push('movie: match names no film')
      }

      const year = releaseYear(best)
      if (!song.releaseYear && year) {
        filled.releaseYear = year
        filled.decade = computeDecade(year)
      }
      if (!song.album && collection) filled.album = collection
      if (!song.genres.length && best.primaryGenreName) filled.genres = [best.primaryGenreName]
      if (!song.durationMs && best.trackTimeMillis) filled.durationMs = best.trackTimeMillis
    } else {
      skipped.push(best ? `low confidence (${bestScore.toFixed(2)})` : 'no results')
    }

    found.push({
      puzzleId: song.puzzleId,
      title: song.title,
      artist: song.artist,
      query,
      matched: best
        ? {
            track: best.trackName ?? '',
            artist: best.artistName ?? '',
            collection: best.collectionName ?? null,
          }
        : null,
      score: Number(bestScore.toFixed(2)),
      filled,
      skipped,
    })

    const mark = Object.keys(filled).length ? '+' : '.'
    console.log(
      `${mark} [${i + 1}/${songs.length}] ${song.title} — ${Object.keys(filled).join(', ') || skipped.join('; ')}`,
    )

    if (values.write && Object.keys(filled).length) {
      await prisma.song.update({ where: { puzzleId: song.puzzleId }, data: filled })
    }

    // After EVERY row, not at the end. A run this long gets interrupted, and
    // the first version of this script lost forty-five rows of lookups to one
    // dropped socket because the file was written once, last.
    if (values.out) await writeFile(values.out, JSON.stringify(found, null, 2))

    await sleep(DELAY_MS)
  }

  const filledCount = found.filter((f) => Object.keys(f.filled).length).length
  console.log(`\n${filledCount}/${found.length} rows gained at least one value`)
  const byField: Record<string, number> = {}
  for (const f of found) {
    for (const k of Object.keys(f.filled)) byField[k] = (byField[k] ?? 0) + 1
  }
  console.log(byField)

  if (values.out) {
    await writeFile(values.out, JSON.stringify(found, null, 2))
    console.log(`wrote ${values.out}`)
  }
  if (!values.write) console.log('\nDRY RUN — nothing written. Re-run with --write to apply.')

  await prisma.$disconnect()
}

main()

// Recompute Song.searchText for the whole catalog.
//
//   npm run backfill:search-text                # report only, writes nothing
//   npm run backfill:search-text -- --write     # apply
//
// Needed because searchText is a DERIVED column that only gets rewritten when
// something writes the row. Change what buildSearchText produces and every
// existing row is stale until this runs — silently, with no error anywhere: the
// typeahead just fails to find tracks it should find.
//
// Two such changes are live as of the film-search work:
//
//   1. Song.movie is now folded into searchText, so a film name finds its
//      tracks. Every row imported before that has a searchText with no film in
//      it.
//   2. lib/catalog and lib/game each had their own copy of the normaliser, and
//      they had drifted on apostrophes — the catalog copy (which every ingest
//      path used) indexed "don t stop me now" while the endpoint queried for
//      "dont stop me now". One normaliser now, but the rows written by the old
//      one still carry the old spelling.
//
// Idempotent: searchText is a pure function of title/artist/movie, so a second
// run reports zero changes. Safe to re-run after a partial failure.

import 'dotenv/config'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildSearchText } from '../src/lib/catalog/search-text'

const { values } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    /// How many rows to hold in memory at once. The catalog is small today;
    /// paging keeps it from mattering when it isn't.
    batch: { type: 'string', default: '500' },
  },
})

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const take = Math.max(1, Number.parseInt(values.batch, 10) || 500)

  let cursor: string | undefined
  let total = 0
  let changed = 0
  let filmAdded = 0

  for (;;) {
    const songs = await prisma.song.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { puzzleId: cursor } } : {}),
      orderBy: { puzzleId: 'asc' },
      select: { puzzleId: true, title: true, artist: true, movie: true, searchText: true },
    })
    if (songs.length === 0) break
    cursor = songs[songs.length - 1].puzzleId

    for (const song of songs) {
      total += 1
      const next = buildSearchText(song.title, song.artist, song.movie)
      if (next === song.searchText) continue

      changed += 1
      if (song.movie) filmAdded += 1
      console.log(`${song.puzzleId}`)
      console.log(`   ${JSON.stringify(song.searchText)}`)
      console.log(`-> ${JSON.stringify(next)}`)

      if (values.write) {
        await prisma.song.update({ where: { puzzleId: song.puzzleId }, data: { searchText: next } })
      }
    }

    if (songs.length < take) break
  }

  console.log(`catalog: ${total} songs`)
  console.log(`  searchText ${values.write ? 'rewritten' : 'stale'}: ${changed}`)
  console.log(`  of those, carrying a film: ${filmAdded}`)
  if (!values.write && changed > 0) {
    console.log(`\nNothing was written. Re-run with -- --write to apply.`)
  }
}

main()

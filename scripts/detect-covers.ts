// Find the covers that say nothing about being covers.
//
//   npm run detect:covers                    # report only
//   npm run detect:covers -- --write         # flag as COVER — SEE WARNING
//   npm run detect:covers -- --out ./x.json
//
// ---------------------------------------------------------------------------
// MEASURED PRECISION: 2 correct out of 7 hits on this catalog (2026-09-04).
// Treat the output as a REVIEW QUEUE and do not use --write unhandled.
//
// The reason is structural, not a tuning problem. Indian film music reuses song
// titles across decades relentlessly, so "the store has a film song with this
// exact name" is a much weaker statement than it looks. Verified misfires from
// the run above:
//
//   Saiyyan        Kailash Kher's 2007 Kailasa original, matched against an
//                  unrelated "Saiyyan" from Nayak (2001).
//   Slowly Slowly  Guru Randhawa & Pitbull's 2019 single, matched against an
//                  unrelated Telugu song from Rowdy Alludu (1991).
//   Subhanallah    matched Ustad Hotel (2012) when the row is a different
//                  "Subhanallah" entirely — so even the true-ish hits cite the
//                  WRONG film.
//
// What it is still good for: narrowing ~700 rows to a handful worth a human
// look. What it cannot do is decide. The confirmed mislabelled rows on this
// catalog live in scripts/lib/corrections.ts, where each one carries the source
// that settled it.
// ---------------------------------------------------------------------------
//
// scripts/clean-catalog.ts catches every variant that ADMITS what it is — a
// title or album saying "Remix", "LoFi", "Karaoke Version". This catches the
// ones that admit nothing: `Dilliwali Girlfriend` credited to "DJ Kushy",
// released 2018, sitting in the catalog where the 2013 Yeh Jawaani Hai Deewani
// recording should be. Nothing in that row's text is wrong. It is just not the
// song anyone means.
//
// The signal is a THREE-part collision, and all three parts are required:
//
//   1. The store has a FILM recording of this exact title, and
//   2. that recording predates this row by 3+ years, and
//   3. the two artist credits share no names.
//
// Any two of those fire constantly on legitimate rows. A film song reissued on
// a compilation trips (1) and (2). A duet listed with different singers trips
// (3). Only all three together describe "someone re-recorded a film song years
// later", and even then this script REPORTS rather than deletes.
//
// Deliberately NOT flagged: an English or Latin track that merely shares a name
// with a Bollywood song. This catalog is multilingual on purpose — Death Cab
// for Cutie, Anitta, Kolby Cooper are all in it legitimately — so "Rockstar" by
// Nickelback is not a failed attempt at the Rockstar soundtrack, and rule (1)
// finding a film "Rockstar" says nothing about it. Language is checked before
// the collision is trusted.

import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { cleanSongTitle, deriveMovie, splitArtists } from './lib/cleanup'
import { searchItunes, releaseYear, sleep } from './lib/itunes'

const { values } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    out: { type: 'string' },
    delay: { type: 'string', default: '2000' },
  },
})

const DELAY_MS = Number(values.delay)

/// How far ahead of the film recording a row must sit before its date counts as
/// evidence. Three years, because soundtracks get reissued and remastered
/// within a year or two of release and those reissues are the same recording.
const MIN_YEAR_GAP = 3

type Collision = {
  puzzleId: string
  title: string
  artist: string
  year: number | null
  album: string | null
  film: { track: string; artist: string; movie: string; year: number }
  yearGap: number
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/// Genres that mark a row as belonging to a non-Indian scene, where a shared
/// title is coincidence rather than a failed match. See the header note about
/// this catalog being multilingual on purpose.
const FOREIGN_GENRES = new Set([
  'rock', 'country', 'alternative', 'pop latino', 'música mexicana', 'musica mexicana',
  'trance', 'electronic', 'dance', 'house', 'techno', 'folk', 'r&b/soul', 'metal',
  'jazz', 'classical', 'reggae', 'k-pop', 'j-pop', 'latin', 'singer/songwriter',
])

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  // Only rows with no film and no variant label yet. A row that already knows
  // what it is needs no help, and a row with a film came from a soundtrack.
  const songs = await prisma.song.findMany({
    where: { movie: null, variantType: null },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`checking ${songs.length} film-less, unflagged rows\n`)
  const collisions: Collision[] = []

  for (const [i, song] of songs.entries()) {
    const genre = (song.genres[0] ?? '').toLowerCase()
    if (FOREIGN_GENRES.has(genre)) {
      console.log(`. [${i + 1}/${songs.length}] ${song.title} — skipped, ${genre}`)
      continue
    }

    const results = await searchItunes(song.title, 'IN', 25)
    const rowArtists = new Set(splitArtists(song.artist).map(normalize))

    let earliest: Collision['film'] | null = null
    for (const r of results) {
      const parsed = cleanSongTitle(r.trackName ?? '')
      // Same song, not merely a similar one.
      if (normalize(parsed.title) !== normalize(song.title)) continue

      const movie = deriveMovie(parsed.movie, r.collectionName ?? null)
      if (!movie) continue

      const year = releaseYear(r)
      if (year === null) continue

      // Rule 3: a shared name means this row IS that recording, reissued.
      const theirs = splitArtists(r.artistName ?? '').map(normalize)
      if (theirs.some((n) => rowArtists.has(n))) continue

      if (!earliest || year < earliest.year) {
        earliest = { track: r.trackName ?? '', artist: r.artistName ?? '', movie, year }
      }
    }

    const rowYear = song.releaseYear
    const gap = earliest && rowYear ? rowYear - earliest.year : 0

    if (earliest && rowYear && gap >= MIN_YEAR_GAP) {
      collisions.push({
        puzzleId: song.puzzleId,
        title: song.title,
        artist: song.artist,
        year: rowYear,
        album: song.album,
        film: earliest,
        yearGap: gap,
      })
      console.log(
        `! [${i + 1}/${songs.length}] ${song.title} — ${song.artist} (${rowYear}) vs ${earliest.artist} (${earliest.year}, ${earliest.movie})`,
      )
      if (values.write) {
        await prisma.song.update({
          where: { puzzleId: song.puzzleId },
          data: { variantType: 'COVER' },
        })
      }
    } else {
      console.log(`. [${i + 1}/${songs.length}] ${song.title}`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\n${collisions.length} likely covers found`)
  if (values.out) {
    await writeFile(values.out, JSON.stringify(collisions, null, 2))
    console.log(`wrote ${values.out}`)
  }
  if (!values.write) console.log('\nDRY RUN — nothing written. Re-run with --write to apply.')

  await prisma.$disconnect()
}

main()

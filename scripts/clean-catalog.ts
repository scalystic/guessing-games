// Catalog cleanup — normalise Song.title / Song.artist / Song.movie across the
// whole table and mark every recording that is not the original.
//
//   npm run clean:catalog                    # report only, writes nothing
//   npm run clean:catalog -- --write         # apply
//   npm run clean:catalog -- --out ./out.json
//
// Report-only by DEFAULT, and that is not politeness. Every rule in
// scripts/lib/cleanup.ts is a guess about a string, the table has hundreds of
// rows nobody has read, and a bad guess here silently changes the answer a
// player is scored against. The report exists to be read before --write is.
//
// ---------------------------------------------------------------------------
// `movie` and `variantType` are FILL-ONLY: a value already in the column is
// never overwritten and never cleared.
//
// That is what makes a second run safe, and it is not a nicety. Both columns
// are derived from markers that live IN the title — `Kesariya (From
// "Brahmastra")`, `Pairon Mein Bandhan Hai - Instrumental`. The first run moves
// those markers OUT of the title and into the columns, which is the whole
// point, and so the second run reads a clean title, derives null, and would
// wipe what the first run just established. Measured on this catalog before the
// guard existed: a re-run cleared 127 films and 25 variant flags.
//
// The other columns have no such problem — title and artist are computed from
// themselves and converge after one pass.
//
// Consequence worth knowing: a WRONG film or variant already in the column
// cannot be corrected by re-running this. Fix those in
// scripts/lib/corrections.ts or the admin editor.
// ---------------------------------------------------------------------------

import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildSearchText, computeDecade } from '../src/lib/catalog/search-text'
import {
  cleanArtistCredit,
  cleanSongTitle,
  deriveMovie,
  detectVariant,
  type SongVariant,
} from './lib/cleanup'

const { values } = parseArgs({
  options: {
    write: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
})

type Change = {
  puzzleId: string
  before: { title: string; artist: string; movie: string | null; variantType: string | null }
  after: { title: string; artist: string; movie: string | null; variantType: SongVariant | null }
  dropped: { name: string; reason: string }[]
  /// Fields still null after the deterministic pass — the work list for the
  /// lookup stage.
  missing: string[]
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const songs = await prisma.song.findMany({ orderBy: { createdAt: 'asc' } })
  const changes: Change[] = []

  for (const song of songs) {
    const { title, movie: titleMovie, featured } = cleanSongTitle(song.title)
    const artist = cleanArtistCredit(song.artist, featured)

    // Read from the RAW title: the cleaner has already stripped the qualifier
    // that identifies the variant, so classifying the cleaned title would find
    // nothing on exactly the rows that need flagging.
    let detected = detectVariant(song.title, song.album)

    // A credit consisting only of labels means the ingest captured an uploader
    // rather than an artist, and rows in that state have consistently turned
    // out to be the wrong track rather than a mislabelled right one.
    if (artist.isLabelOnly) detected = 'MISMATCH'

    // Fill-only. See the header: a clean title yields null on a second pass, so
    // deriving over an existing value destroys what the first pass found.
    const movie = song.movie ?? deriveMovie(titleMovie, song.album)
    const variantType = song.variantType ?? detected

    const missing: string[] = []
    if (!movie) missing.push('movie')
    if (!song.releaseYear) missing.push('releaseYear')
    if (!song.album) missing.push('album')
    if (!song.genres.length) missing.push('genres')

    const changed =
      title !== song.title ||
      artist.artist !== song.artist ||
      movie !== song.movie ||
      variantType !== song.variantType

    if (changed || missing.length) {
      changes.push({
        puzzleId: song.puzzleId,
        before: {
          title: song.title,
          artist: song.artist,
          movie: song.movie,
          variantType: song.variantType,
        },
        after: { title, artist: artist.artist, movie, variantType },
        dropped: artist.dropped,
        missing,
      })
    }

    if (!values.write || !changed) continue

    await prisma.song.update({
      where: { puzzleId: song.puzzleId },
      data: {
        title,
        artist: artist.artist,
        movie,
        variantType,
        decade: computeDecade(song.releaseYear),
        searchText: buildSearchText(title, artist.artist),
        // The store title stays reachable by the typeahead. A player who knows
        // the track as `Kesariya (From "Brahmastra")` must still be able to
        // find it after the name became `Kesariya`.
        aliases: dedupe([...song.aliases, song.title]).filter((a) => a !== title),
      },
    })
  }

  report(songs.length, changes)

  if (values.out) {
    await writeFile(values.out, JSON.stringify(changes, null, 2))
    console.log(`\nwrote ${changes.length} change records to ${values.out}`)
  }
  if (!values.write) console.log('\nDRY RUN — nothing written. Re-run with --write to apply.')

  await prisma.$disconnect()
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
}

function report(total: number, changes: Change[]) {
  const titleChanged = changes.filter((c) => c.before.title !== c.after.title)
  const artistChanged = changes.filter((c) => c.before.artist !== c.after.artist)
  const movieFilled = changes.filter((c) => !c.before.movie && c.after.movie)
  const variants = changes.filter((c) => c.after.variantType)

  console.log(`catalog: ${total} songs`)
  console.log(`  titles rewritten : ${titleChanged.length}`)
  console.log(`  artists rewritten: ${artistChanged.length}`)
  console.log(`  movies filled    : ${movieFilled.length}`)
  console.log(`  variants flagged : ${variants.length}`)

  const byVariant: Record<string, number> = {}
  for (const c of variants) {
    const key = c.after.variantType as string
    byVariant[key] = (byVariant[key] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(byVariant).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${k.padEnd(13)} ${n}`)
  }

  const stillMissing: Record<string, number> = {}
  for (const c of changes) for (const m of c.missing) stillMissing[m] = (stillMissing[m] ?? 0) + 1
  console.log(`  still missing after this pass:`)
  for (const [k, n] of Object.entries(stillMissing).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${k.padEnd(13)} ${n}`)
  }
}

main()

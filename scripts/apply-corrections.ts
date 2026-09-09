// Apply the hand-verified corrections in scripts/lib/corrections.ts.
//
//   npm run fix:catalog                # report only
//   npm run fix:catalog -- --write     # apply
//
// The last step of the cleanup chain, and the only one that writes values no
// algorithm produced. Run order matters:
//
//   1. clean:catalog    normalise title/artist/movie, flag labelled variants
//   2. enrich:catalog   fill gaps the iTunes store can confirm
//   3. fix:catalog      this — the residue, verified by hand
//
// Idempotent: every write is the same fixed value from the corrections table,
// so a second run is a no-op. Safe to re-run after a partial failure.

import 'dotenv/config'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildSearchText, computeDecade } from '../src/lib/catalog/search-text'
import { FILMS, MISLABELLED, REPAIRS } from './lib/corrections'

const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } })

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  let repaired = 0
  let filmed = 0
  let flagged = 0
  const missing: string[] = []

  // --- Full repairs: title, artist, film, year, album, genres -------------
  for (const [puzzleId, fix] of Object.entries(REPAIRS)) {
    const song = await prisma.song.findUnique({ where: { puzzleId } })
    if (!song) {
      missing.push(`REPAIRS: ${puzzleId}`)
      continue
    }

    console.log(`repair ${puzzleId}`)
    console.log(`   title  ${JSON.stringify(song.title)} -> ${JSON.stringify(fix.title)}`)
    console.log(`   artist ${JSON.stringify(song.artist)} -> ${JSON.stringify(fix.artist)}`)
    console.log(`   movie  ${JSON.stringify(song.movie)} -> ${JSON.stringify(fix.movie)}`)
    console.log(`   year   ${song.releaseYear} -> ${fix.releaseYear}`)

    if (values.write) {
      await prisma.song.update({
        where: { puzzleId },
        data: {
          title: fix.title,
          artist: fix.artist,
          movie: fix.movie,
          releaseYear: fix.releaseYear,
          decade: computeDecade(fix.releaseYear),
          album: fix.album,
          genres: fix.genres,
          searchText: buildSearchText(fix.title, fix.artist, fix.movie),
          // The scraped headline goes to aliases, not the bin. It is what the
          // row was found under, and a player who typed it should still match.
          //
          // dropOldTitle opts out, for the case where the old title was the
          // right name of a DIFFERENT song rather than a wrong name for this
          // one. See Repair.dropOldTitle.
          aliases: fix.dropOldTitle
            ? song.aliases.filter((a) => a !== fix.title)
            : [...new Set([...song.aliases, song.title])].filter((a) => a !== fix.title),
          // A repaired row is a NEW claim about what this recording is, and the
          // old hook offset was auditioned against the old claim. Clearing the
          // lock forces it back through review rather than letting a corrected
          // row inherit a sign-off it never had.
          //
          // keepLock opts out, for the case where the sign-off WAS against this
          // audio and only the text around it was wrong. See Repair.keepLock.
          ...(fix.keepLock ? {} : { isLocked: false, lockedAt: null, lockedById: null }),
          // These rows were flagged MISMATCH because their metadata was
          // unusable. The metadata is now correct, so the flag is spent.
          variantType: null,
        },
      })
    }
    repaired += 1
  }

  // --- Film-only fills ----------------------------------------------------
  for (const [puzzleId, { movie, note }] of Object.entries(FILMS)) {
    const song = await prisma.song.findUnique({ where: { puzzleId } })
    if (!song) {
      missing.push(`FILMS: ${puzzleId}`)
      continue
    }
    if (song.movie === movie) continue

    console.log(`film   ${song.title} -> ${movie}${note ? `   (${note})` : ''}`)
    if (values.write) {
      await prisma.song.update({ where: { puzzleId }, data: { movie } })
    }
    filmed += 1
  }

  // --- Mislabelled rows ---------------------------------------------------
  for (const [puzzleId, { variant, note }] of Object.entries(MISLABELLED)) {
    const song = await prisma.song.findUnique({ where: { puzzleId } })
    if (!song) {
      missing.push(`MISLABELLED: ${puzzleId}`)
      continue
    }
    if (song.variantType === variant) continue

    console.log(`flag   ${song.title} — ${song.artist} -> ${variant}   (${note})`)
    if (values.write) {
      await prisma.song.update({ where: { puzzleId }, data: { variantType: variant } })
    }
    flagged += 1
  }

  console.log(`\n${repaired} repaired, ${filmed} films filled, ${flagged} flagged`)
  if (missing.length) {
    console.log(`\nWARNING — ${missing.length} correction(s) target rows that no longer exist:`)
    for (const m of missing) console.log(`   ${m}`)
  }
  if (!values.write) console.log('\nDRY RUN — nothing written. Re-run with --write to apply.')

  await prisma.$disconnect()
}

main()

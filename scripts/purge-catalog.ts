// Purge the ingested song catalog for a game — Puzzle + Song + PuzzleAsset, and
// the play history that references them.
//
//   npm run purge:catalog                      # report only, changes nothing
//   npm run purge:catalog -- --apply
//   npm run purge:catalog -- --game songless --apply
//
// Why this needs a script rather than a `deleteMany`: Puzzle is referenced by
// RunRound and DailyChallengePuzzle WITHOUT onDelete, so Postgres restricts the
// delete while any play history points at it. Those rows have to go first, in
// dependency order, and that is a real data loss decision — hence --apply and
// the report.
//
// Storage objects are NOT touched. R2 keys are content-addressed, so re-ingesting
// the same audio rewrites the same key; stale keys are orphaned, not wrong. Use
// `--list-keys` to dump what would be left behind so it can be swept separately.

import 'dotenv/config'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'list-keys': { type: 'boolean', default: false },
  },
})

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function main() {
  const games = await prisma.game.findMany({ select: { id: true, slug: true, name: true } })
  if (games.length === 0) {
    console.log('No games in the database — nothing to purge.')
    return
  }

  const target = values.game ? games.filter((g) => g.slug === values.game) : games
  if (target.length === 0) {
    throw new Error(
      `No game with slug "${values.game}". Present: ${games.map((g) => g.slug).join(', ')}`,
    )
  }

  console.log(`Scope: ${target.map((g) => g.slug).join(', ')}\n`)

  for (const game of target) {
    const gameId = game.id
    const puzzleWhere = { gameId }
    const puzzleIds = (
      await prisma.puzzle.findMany({ where: puzzleWhere, select: { id: true } })
    ).map((p) => p.id)

    if (puzzleIds.length === 0) {
      console.log(`[${game.slug}] no puzzles — nothing to purge.`)
      continue
    }

    const inPuzzles = { puzzleId: { in: puzzleIds } }
    const [songs, assets, rounds, dailyLinks, history, dailies] = await Promise.all([
      prisma.song.count({ where: inPuzzles }),
      prisma.puzzleAsset.count({ where: inPuzzles }),
      prisma.runRound.count({ where: inPuzzles }),
      prisma.dailyChallengePuzzle.count({ where: inPuzzles }),
      prisma.playerPuzzleHistory.count({ where: inPuzzles }),
      prisma.dailyChallenge.count({ where: { gameId } }),
    ])

    // A round cannot be orphaned from its run, so runs with any affected round go too.
    const runIds = (
      await prisma.run.findMany({
        where: { rounds: { some: inPuzzles } },
        select: { id: true },
      })
    ).map((r) => r.id)

    console.log(`[${game.slug}] "${game.name}"`)
    console.log(`  Puzzle                 ${puzzleIds.length}`)
    console.log(`  Song                   ${songs}   (cascades with Puzzle)`)
    console.log(`  PuzzleAsset            ${assets}   (cascades with Puzzle)`)
    console.log(`  PlayerPuzzleHistory    ${history}   (cascades with Puzzle)`)
    console.log(`  RunRound               ${rounds}   BLOCKS delete — removed explicitly`)
    console.log(`  DailyChallengePuzzle   ${dailyLinks}   BLOCKS delete — removed explicitly`)
    console.log(`  Run (has such a round) ${runIds.length}   removed: a run without rounds is broken`)
    console.log(`  DailyChallenge         ${dailies}   removed: would be left with no puzzles`)

    if (values['list-keys']) {
      const keys = await prisma.puzzleAsset.findMany({
        where: inPuzzles,
        select: { kind: true, storageKey: true, byteSize: true },
        orderBy: { storageKey: 'asc' },
      })
      console.log(`\n  --- storage keys (${keys.length}) ---`)
      for (const k of keys) console.log(`  ${k.kind}\t${k.byteSize ?? '?'}\t${k.storageKey}`)
      console.log('  --- end storage keys ---\n')
    }

    if (!values.apply) {
      console.log('\n  (report only — pass --apply to delete)\n')
      continue
    }

    // Dependency order, one transaction: either the catalog is gone or nothing moved.
    const result = await prisma.$transaction(async (tx) => {
      const guesses = await tx.guess.deleteMany({ where: { round: inPuzzles } })
      const hintsByRound = await tx.hintUsage.deleteMany({ where: { round: inPuzzles } })
      const hintsByRun = await tx.hintUsage.deleteMany({ where: { runId: { in: runIds } } })
      const deletedRounds = await tx.runRound.deleteMany({ where: inPuzzles })
      const otherRounds = await tx.runRound.deleteMany({ where: { runId: { in: runIds } } })
      // LedgerEntry.runId is SetNull, so the ledger survives with the run detached.
      const deletedRuns = await tx.run.deleteMany({ where: { id: { in: runIds } } })
      const deletedDailyLinks = await tx.dailyChallengePuzzle.deleteMany({ where: inPuzzles })
      const deletedDailies = await tx.dailyChallenge.deleteMany({ where: { gameId } })
      const deletedPuzzles = await tx.puzzle.deleteMany({ where: puzzleWhere })
      return {
        guesses: guesses.count,
        hints: hintsByRound.count + hintsByRun.count,
        rounds: deletedRounds.count + otherRounds.count,
        runs: deletedRuns.count,
        dailyLinks: deletedDailyLinks.count,
        dailies: deletedDailies.count,
        puzzles: deletedPuzzles.count,
      }
    })

    console.log('\n  deleted:', result)

    const left = await prisma.puzzle.count({ where: puzzleWhere })
    console.log(`  puzzles remaining for ${game.slug}: ${left}\n`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

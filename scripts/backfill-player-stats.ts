// Rebuild PlayerGameStat from the Run history that produced it.
//
//   npm run backfill:player-stats                 # report only, changes nothing
//   npm run backfill:player-stats -- --apply
//
// PlayerGameStat was declared in the initial schema but never written by the
// gameplay path — only the multiplayer socket server touched it, and only its
// two multiplayer columns. Every other column has been sitting at 0 for every
// player since launch, which is why nothing could be shown back to them.
// completeRun() now maintains the rollup going forward; this fills in
// everything that happened before it did.
//
// Runs are the source of truth and they are all still there, so this is a pure
// recomputation: it does not read the existing rollup and it is safe to run
// more than once. The two multiplayer columns are the exception — nothing in
// the Run table records who WON a room, so they are carried through untouched
// rather than recomputed to a wrong value.
//
// Only COMPLETED runs count. An abandoned or expired run is not a run the
// player finished, and counting it would inflate runsPlayed while depressing
// the win rate for everyone who ever closed a tab mid-set.

import 'dotenv/config'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
  },
})

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

/// Longest and current run of consecutive UTC days, from the set of day keys a
/// player completed a DAILY run on.
///
/// "Current" is anchored to today, and a gap of one day is tolerated: the day
/// is not over, so a player who has not played yet today still holds their
/// streak. Past that, a missing day ends it. This is the same rule the client's
/// useDailyHistory applies to the streak pill — the two have to agree or the
/// header and the stats panel will show different numbers for the same thing.
function streaksFrom(dayKeys: string[]): { current: number; longest: number } {
  if (dayKeys.length === 0) return { current: 0, longest: 0 }

  const sorted = [...new Set(dayKeys)].sort()
  const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86_400_000)

  let longest = 1
  let span = 1
  for (let i = 1; i < sorted.length; i += 1) {
    span = dayNumber(sorted[i]!) - dayNumber(sorted[i - 1]!) === 1 ? span + 1 : 1
    if (span > longest) longest = span
  }

  const today = dayNumber(new Date().toISOString().slice(0, 10))
  const lastPlayed = dayNumber(sorted[sorted.length - 1]!)
  // `span` is the length of the run ending at the most recent day played.
  const current = today - lastPlayed <= 1 ? span : 0

  return { current, longest }
}

async function main() {
  const runs = await prisma.run.findMany({
    where: { status: 'COMPLETED' },
    select: {
      playerId: true,
      gameId: true,
      mode: true,
      dayKey: true,
      score: true,
      xpEarned: true,
      roundsSolved: true,
      roundsFailed: true,
      bestStreak: true,
    },
  })

  if (runs.length === 0) {
    console.log('No completed runs — nothing to backfill.')
    return
  }

  type Acc = {
    playerId: string
    gameId: string
    runsPlayed: number
    roundsPlayed: number
    roundsSolved: number
    bestRunScore: number
    bestDailyScore: number
    bestRoundStreak: number
    xp: number
    dailyDayKeys: string[]
  }

  const byPlayerGame = new Map<string, Acc>()

  for (const run of runs) {
    const key = `${run.playerId}:${run.gameId}`
    const acc: Acc = byPlayerGame.get(key) ?? {
      playerId: run.playerId,
      gameId: run.gameId,
      runsPlayed: 0,
      roundsPlayed: 0,
      roundsSolved: 0,
      bestRunScore: 0,
      bestDailyScore: 0,
      bestRoundStreak: 0,
      xp: 0,
      dailyDayKeys: [],
    }

    acc.runsPlayed += 1
    acc.roundsPlayed += run.roundsSolved + run.roundsFailed
    acc.roundsSolved += run.roundsSolved
    acc.xp += run.xpEarned
    acc.bestRunScore = Math.max(acc.bestRunScore, run.score)
    acc.bestRoundStreak = Math.max(acc.bestRoundStreak, run.bestStreak)

    if (run.mode === 'DAILY' && run.dayKey) {
      acc.bestDailyScore = Math.max(acc.bestDailyScore, run.score)
      acc.dailyDayKeys.push(run.dayKey)
    }

    byPlayerGame.set(key, acc)
  }

  const rows = [...byPlayerGame.values()]
  console.log(`${runs.length} completed runs → ${rows.length} PlayerGameStat rows\n`)

  const sample = rows.slice(0, 5)
  for (const row of sample) {
    const { current, longest } = streaksFrom(row.dailyDayKeys)
    console.log(
      `  ${row.playerId.slice(0, 8)}…  runs ${row.runsPlayed}  solved ${row.roundsSolved}/${row.roundsPlayed}` +
        `  xp ${row.xp}  best ${row.bestRunScore}  streak ${current} (max ${longest})`,
    )
  }
  if (rows.length > sample.length) console.log(`  … and ${rows.length - sample.length} more`)

  if (!values.apply) {
    console.log('\nReport only. Re-run with --apply to write.')
    return
  }

  let written = 0
  for (const row of rows) {
    const { current, longest } = streaksFrom(row.dailyDayKeys)
    const lastPlayedDayKey =
      row.dailyDayKeys.length > 0 ? [...row.dailyDayKeys].sort().at(-1)! : null

    const recomputed = {
      runsPlayed: row.runsPlayed,
      roundsPlayed: row.roundsPlayed,
      roundsSolved: row.roundsSolved,
      bestRunScore: row.bestRunScore,
      bestDailyScore: row.bestDailyScore,
      bestRoundStreak: row.bestRoundStreak,
      currentDailyStreak: current,
      longestDailyStreak: longest,
      lastPlayedDayKey,
      xp: row.xp,
    }

    // update, not a blind overwrite of the whole row: multiplayerRunsPlayed and
    // multiplayerWins are omitted from `recomputed` precisely so an existing
    // row keeps them.
    await prisma.playerGameStat.upsert({
      where: { playerId_gameId: { playerId: row.playerId, gameId: row.gameId } },
      create: { playerId: row.playerId, gameId: row.gameId, ...recomputed },
      update: recomputed,
    })
    written += 1
  }

  console.log(`\nWrote ${written} rows.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

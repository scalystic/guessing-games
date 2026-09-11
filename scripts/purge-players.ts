// Purge players and everything they own — runs, rounds, guesses, hints, ledger,
// stats, puzzle history, leaderboard rows, guest claims.
//
//   npm run purge:players                      # report only, changes nothing
//   npm run purge:players -- --apply           # delete non-admins (default scope)
//   npm run purge:players -- --all --apply     # admins too
//   npm run purge:players -- --apply --reset-counters
//   npm run purge:players -- --apply --daily   # published daily challenges too
//
// Almost every player-owned table hangs off Player with onDelete: Cascade, so
// Postgres does the work in one statement. Multiplayer is the exception and the
// one place order matters: MultiplayerRoom.host and MultiplayerRoomPlayer.player
// are required relations with no onDelete, which is Restrict — deleting a player
// who ever hosted or joined a room fails on the FK. So rooms touching an
// in-scope player are deleted FIRST. Run.multiplayerRoomId and
// MultiplayerRoomPlayer.runId are optional, so they SetNull rather than blocking.
//
// Admins are excluded by default — isAdmin is only ever set by another admin or
// scripts/create-admin.ts, so it is the one flag that can't be self-granted, and
// wiping it locks everyone out of /admin/*.
//
// The catalog is NOT touched: Puzzle rows, Song rows and PuzzleAsset storage keys
// survive. Puzzle.playCount / solveCount / earlySolveCount / solveRate are caches
// of play history, so deleting players leaves them overstated — pass
// --reset-counters to zero them and clear retunedAt, returning popularity tuning
// to its seeded state.
//
// DailyChallenge is not player-owned and survives by default — a published day is
// a shared artifact, not someone's progress. --daily drops it anyway (entries
// cascade, Run.dailyChallengeId SetNulls), which is what a full reset wants:
// nothing is left pinned to a day no player played.

import 'dotenv/config'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const { values } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    'reset-counters': { type: 'boolean', default: false },
    daily: { type: 'boolean', default: false },
  },
})

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function main() {
  // `{}` rather than `{ isAdmin: true }` for --all: the scope has to match the
  // deleteMany exactly, and an empty where means every player.
  const where = values.all ? {} : { isAdmin: false }
  const scope = values.all ? 'ALL players (admins included)' : 'non-admin players'

  const playerIds = (await prisma.player.findMany({ where, select: { id: true } })).map((p) => p.id)

  const admins = await prisma.player.findMany({
    where: { isAdmin: true },
    select: { id: true, handle: true, email: true },
  })

  console.log(`Scope: ${scope}\n`)

  if (playerIds.length === 0) {
    console.log('No players in scope — nothing to purge.')
    return
  }

  const inPlayers = { playerId: { in: playerIds } }
  const runIds = (await prisma.run.findMany({ where: inPlayers, select: { id: true } })).map(
    (r) => r.id,
  )
  const inRuns = { runId: { in: runIds } }

  // A room blocks the player delete if an in-scope player hosted it OR sat in it.
  // Both are Restrict, so both arms have to be in scope here or the FK bites.
  const roomsWhere = {
    OR: [
      { hostPlayerId: { in: playerIds } },
      { players: { some: { playerId: { in: playerIds } } } },
    ],
  }
  const roomIds = (await prisma.multiplayerRoom.findMany({ where: roomsWhere, select: { id: true } }))
    .map((r) => r.id)
  const inRooms = { roomId: { in: roomIds } }

  const [
    guests,
    users,
    rounds,
    guesses,
    hints,
    ledger,
    stats,
    history,
    board,
    claims,
    roomPlayers,
    roomRounds,
    dailies,
    dailyEntries,
  ] = await Promise.all([
    prisma.player.count({ where: { ...where, kind: 'GUEST' } }),
    prisma.player.count({ where: { ...where, kind: 'USER' } }),
    prisma.runRound.count({ where: inRuns }),
    prisma.guess.count({ where: { round: inRuns } }),
    prisma.hintUsage.count({ where: inRuns }),
    prisma.ledgerEntry.count({ where: inPlayers }),
    prisma.playerGameStat.count({ where: inPlayers }),
    prisma.playerPuzzleHistory.count({ where: inPlayers }),
    prisma.leaderboardEntry.count({ where: inPlayers }),
    prisma.guestClaim.count({
      where: {
        OR: [{ guestPlayerId: { in: playerIds } }, { userPlayerId: { in: playerIds } }],
      },
    }),
    prisma.multiplayerRoomPlayer.count({ where: inRooms }),
    prisma.multiplayerRound.count({ where: inRooms }),
    prisma.dailyChallenge.count(),
    prisma.dailyChallengePuzzle.count(),
  ])

  console.log(`  Player                 ${playerIds.length}   (${guests} guest, ${users} user)`)
  console.log(`  Run                    ${runIds.length}   (cascades with Player)`)
  console.log(`  RunRound               ${rounds}   (cascades with Run)`)
  console.log(`  Guess                  ${guesses}   (cascades with RunRound)`)
  console.log(`  HintUsage              ${hints}   (cascades with Run)`)
  console.log(`  LedgerEntry            ${ledger}   (cascades with Player)`)
  console.log(`  PlayerGameStat         ${stats}   (cascades with Player)`)
  console.log(`  PlayerPuzzleHistory    ${history}   (cascades with Player)`)
  console.log(`  LeaderboardEntry       ${board}   (cascades with Player)`)
  console.log(`  GuestClaim             ${claims}   (cascades with Player)`)
  console.log(`  MultiplayerRoom        ${roomIds.length}   (deleted FIRST — host/player FKs restrict)`)
  console.log(`  MultiplayerRoomPlayer  ${roomPlayers}   (cascades with MultiplayerRoom)`)
  console.log(`  MultiplayerRound       ${roomRounds}   (cascades with MultiplayerRoom)`)
  if (values.daily) {
    console.log(`  DailyChallenge         ${dailies}   (--daily)`)
    console.log(`  DailyChallengePuzzle   ${dailyEntries}   (cascades with DailyChallenge)`)
  } else {
    console.log(
      `\n  DailyChallenge kept: ${dailies} days / ${dailyEntries} entries — pass --daily to drop them`,
    )
  }

  console.log(`\n  Admins ${values.all ? 'IN SCOPE — will be deleted' : 'kept'}: ${admins.length}`)
  for (const a of admins) console.log(`    ${a.handle ?? '(no handle)'}  ${a.email ?? '(no email)'}`)

  if (!values.all && admins.length === 0) {
    console.log('    ⚠  no admin exists — run `npm run create-admin` before purging')
  }

  const puzzles = await prisma.puzzle.count()
  console.log(`\n  Catalog untouched: ${puzzles} puzzles (Song + PuzzleAsset kept)`)
  if (!values['reset-counters']) {
    console.log('  Puzzle play counters left as-is — pass --reset-counters to zero them')
  }

  if (!values.apply) {
    console.log('\n  (report only — pass --apply to delete)\n')
    return
  }

  const result = await prisma.$transaction(async (tx) => {
    // Rooms before players: see the Restrict note at the top of this file.
    const rooms = await tx.multiplayerRoom.deleteMany({ where: { id: { in: roomIds } } })
    const daily = values.daily
      ? await tx.dailyChallenge.deleteMany({})
      : { count: 0 }
    const deleted = await tx.player.deleteMany({ where })
    const counters = values['reset-counters']
      ? await tx.puzzle.updateMany({
          data: {
            playCount: 0,
            solveCount: 0,
            earlySolveCount: 0,
            solveRate: null,
            retunedAt: null,
          },
        })
      : { count: 0 }
    return {
      multiplayerRooms: rooms.count,
      dailyChallenges: daily.count,
      players: deleted.count,
      puzzleCountersReset: counters.count,
    }
  })

  console.log('\n  deleted:', result)

  const [leftPlayers, leftRuns, leftBoard, leftLedger, leftRooms, leftDaily] = await Promise.all([
    prisma.player.count(),
    prisma.run.count(),
    prisma.leaderboardEntry.count(),
    prisma.ledgerEntry.count(),
    prisma.multiplayerRoom.count(),
    prisma.dailyChallenge.count(),
  ])
  console.log(
    `  remaining — Player ${leftPlayers}, Run ${leftRuns}, LeaderboardEntry ${leftBoard}, ` +
      `LedgerEntry ${leftLedger}, MultiplayerRoom ${leftRooms}, DailyChallenge ${leftDaily}\n`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

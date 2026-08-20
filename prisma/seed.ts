// Seed — songless game registry.
//
// Seeds CONFIGURATION only: the single Game row, including its reveal ladder and
// popularity curve. The catalog (Puzzle / Song / PuzzleAsset) is not seeded —
// puzzles carry a popularity signal from an external source and clips that have
// to exist in object storage, so they arrive through ingest, not through this
// file.
//
// Idempotent: the write is an upsert keyed on the unique slug, so this doubles
// as "re-apply the tuning values" after editing the numbers below.
//
// Run with:  npm run db:seed   (or `prisma migrate reset`, which calls it)

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

// ------------------------------------------------------------------
// Tunables
// ------------------------------------------------------------------

const MAX_ATTEMPTS = 6

/// Cumulative ms of audio unlocked at each stage. Length MUST equal
/// MAX_ATTEMPTS — the DB can't enforce it, so we check before writing.
const REVEAL_LADDER = [200, 700, 1200, 2200, 4000, 7000]

/// Rounds in the daily challenge. Everyone plays the same 10 songs.
const DAILY_ROUNDS = 10

const SONGLESS = {
  slug: 'songless',
  name: 'Songless',
  tagline: 'Name the track before the clip runs out.',
  isActive: true,
  maxAttempts: MAX_ATTEMPTS,
  livesPerRun: 3,
  dailyRounds: DAILY_ROUNDS,
  revealLadder: REVEAL_LADDER,

  // The one difficulty knob: round 1 sits near the top of the catalog, and each
  // later round slides toward obscurity. Over 10 rounds this walks 90 → 58.5,
  // so the ramp has to be steeper than it would be for a 20-round day.
  startPopularity: 90,
  rampPerRound: 3.5,
  minPopularity: 20,
  sampleWindow: 5,

  scoringVersion: 1,
  puzzleCooldownDays: 45,
  config: {
    // Read by the answer UI; the engine itself stays game-agnostic.
    answerKind: 'SONG',
    assetKind: 'AUDIO_CLIP',
    // v1 ships daily + practice. ENDLESS is schema-ready but unwired.
    modes: ['DAILY', 'PRACTICE'],
  },
}

// ------------------------------------------------------------------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  if (REVEAL_LADDER.length !== MAX_ATTEMPTS) {
    throw new Error(
      `revealLadder has ${REVEAL_LADDER.length} stages but maxAttempts is ${MAX_ATTEMPTS} — they must match.`,
    )
  }

  const { slug, ...fields } = SONGLESS

  const game = await prisma.game.upsert({
    where: { slug },
    create: { slug, ...fields },
    update: fields,
  })

  const lastRound = Math.max(
    game.minPopularity,
    game.startPopularity - game.rampPerRound * (game.dailyRounds - 1),
  )

  console.log(`game: ${game.slug} (${game.id})`)
  console.log(
    `  ${game.dailyRounds} daily rounds · ${game.maxAttempts} attempts · ` +
      `${game.livesPerRun} lives`,
  )
  console.log(
    `  popularity ${game.startPopularity} → ${lastRound} ` +
      `(-${game.rampPerRound}/round, floor ${game.minPopularity}, ±${game.sampleWindow})`,
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

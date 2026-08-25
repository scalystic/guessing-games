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
///
/// Roughly doubling: a 0.4s taste, then each rung about twice the last, with the
/// final one stretching to the 15s ceiling. Stage 1 stays deliberately tiny —
/// hookStartMs puts it on the hook, so 0.4s is already enough for a song someone
/// knows cold, and that is what makes a 6-attempt spread mean anything.
const REVEAL_LADDER = [400, 1100, 2200, 4400, 8800, 15000]

/// Bump whenever REVEAL_LADDER changes. PuzzleAsset.stageByteOffsets carries the
/// revision it was cut against and the audio route refuses a mismatch, so this is
/// what stops clips cut for the old ladder from being served against the new one.
///
/// 2: the 7s ladder [400, 700, 1200, 2200, 4000, 7000] became the 15s one above,
/// inside a 30s stored clip. That is a re-ingest, not a reslice — the old clips
/// physically hold 7s of audio, so no offset recomputation can reach 15s.
const LADDER_REVISION = 2

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
  ladderRevision: LADDER_REVISION,

  // The one difficulty knob: round 1 sits near the top of the catalog, and each
  // later round slides toward obscurity. Over 10 rounds this walks 90 → 58.5,
  // so the ramp has to be steeper than it would be for a 20-round day.
  startPopularity: 90,
  rampPerRound: 3.5,
  minPopularity: 20,
  /// Wide on purpose, and it is a statement about the CATALOG, not the curve.
  ///
  /// 412 of the ~450 puzzles carry a flat seedPopularity of 70: they were bulk
  /// ingested with no per-track recognisability rating, because nothing in the
  /// pipeline can infer one (iTunes exposes no popularity signal) and hand-rating
  /// that many is its own project. At ±5 a flat pool is reachable from only three
  /// of the ten round targets, so the other seven would widen to a fallback window
  /// and log about a thin catalog on every single run — a warning that would be
  /// describing the rating gap, not a real hole at that percentile.
  ///
  /// So: ±25 spans the whole 90 → 58.5 walk, every round draws from the full pool,
  /// and the ramp stays honest for the ~40 hand-rated tracks that actually carry a
  /// spread. Narrow this back toward 5 as real ratings (or telemetry-retuned
  /// Puzzle.popularity) arrive — it is the lever that makes the ramp bite again.
  sampleWindow: 25,

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

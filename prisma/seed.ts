// Seed — songless game registry + the bootstrap admin.
//
// Seeds CONFIGURATION only: the single Game row (reveal ladder, popularity
// curve) and one admin Player. The catalog (Puzzle / Song) is not seeded —
// puzzles carry a popularity signal from an external source, so they arrive
// through the admin YouTube import, not through this file.
//
// Idempotent: both writes are upserts keyed on a unique column, so this doubles
// as "re-apply the tuning values" after editing the numbers below. Re-running
// does NOT rotate an existing admin password unless ADMIN_PASSWORD is set.
//
// Run with:  npm run db:seed   (or `prisma migrate reset`, which calls it)

import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
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
// Bootstrap admin
// ------------------------------------------------------------------

/// There is no admin signup flow by design, so a fresh database has no way in
/// until something creates the first admin. `scripts/create-admin.ts` did that
/// job manually; seeding it here means `prisma migrate reset` leaves a usable
/// login behind instead of a database nobody can administer.
///
/// An admin is not its own table: it is a Player with `kind: 'USER'`,
/// `isAdmin: true` and a bcrypt hash. See src/lib/admin/auth.ts, which re-checks
/// isAdmin against the DB on every call rather than trusting the JWT claim.

/// Matches scripts/create-admin.ts and src/lib/auth/actions.ts. Changing it here
/// alone would make hashes this file writes cost a different amount to verify
/// than the ones the signup path writes.
const BCRYPT_ROUNDS = 12

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@cluecade.local').trim().toLowerCase()
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Admin'

/// NO PASSWORD IS HARDCODED HERE, deliberately — a literal in a committed seed
/// is a published credential the moment the repo is shared, and seeds get run
/// against more than just laptops.
///
/// Set ADMIN_PASSWORD to choose one. With it unset, a fresh admin gets a random
/// 24-char password printed ONCE to stdout below; copy it from the seed output.
function generatePassword(): string {
  // base64url over 18 bytes → 24 chars, no padding, shell-safe.
  return randomBytes(18).toString('base64url')
}

async function seedAdmin(): Promise<void> {
  const provided = process.env.ADMIN_PASSWORD

  if (provided !== undefined && provided.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.')
  }

  const existing = await prisma.player.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, passwordHash: true },
  })

  // Rotate only on an explicit ADMIN_PASSWORD. Without that rule, every re-seed
  // would silently invalidate the password the operator is already using — and
  // this file runs on every `migrate reset`.
  const password = provided ?? (existing?.passwordHash ? null : generatePassword())
  const isGenerated = provided === undefined && password !== null

  const passwordHash = password === null ? null : await bcrypt.hash(password, BCRYPT_ROUNDS)

  const admin = await prisma.player.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      kind: 'USER',
      email: ADMIN_EMAIL,
      displayName: ADMIN_NAME,
      passwordHash: passwordHash!,
      isAdmin: true,
    },
    // Always re-assert isAdmin: that is the repair path if the flag was cleared.
    update: {
      isAdmin: true,
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: { id: true, email: true },
  })

  // Self-managed auth convention — see signup() in src/lib/auth/actions.ts.
  await prisma.player.update({
    where: { id: admin.id },
    data: { authUserId: admin.id },
  })

  console.log(`admin: ${admin.email} (${admin.id})`)
  if (isGenerated) {
    console.log('')
    console.log('  ┌─ GENERATED ADMIN PASSWORD — shown once, not recoverable ─┐')
    console.log(`     ${password}`)
    console.log('  └──────────────────────────────────────────────────────────┘')
    console.log('  Save it now, then sign in at /admin/login.')
    console.log('  To set your own instead: ADMIN_PASSWORD=... npm run db:seed')
    console.log('')
  } else if (provided !== undefined) {
    console.log('  password set from ADMIN_PASSWORD')
  } else {
    console.log('  password unchanged (already set; pass ADMIN_PASSWORD to rotate)')
  }
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

  await seedAdmin()
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

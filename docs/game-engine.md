# Game engine — run/round state machine

Companion to [`prisma/schema.prisma`](../prisma/schema.prisma). One engine serves
every game and every mode; a game is configuration, a mode is a flag on `Run`.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Puzzle** | One thing to guess. For songless, one song. |
| **Reveal stage** | How much of the puzzle is unlocked. Stage 1 = 0.2s, stage 6 = 7s. Cumulative. |
| **Attempt** | A guess or a skip. Both advance the stage. 6 per puzzle. |
| **Round** | One puzzle inside a run. |
| **Run** | One sitting. Daily = 10 rounds, 3 lives, and a third miss ends it. Practice/endless = unbounded; lives are counted but never end the run. |

**There are no difficulty tiers.** One daily challenge, ten songs, same set for
everyone — nothing to pick before you play. The ladder, attempt count, and answer
format are identical for every player and every round; difficulty ramps *within*
a run and comes from two places only: which slice of the catalog is sampled
(`Game.startPopularity` + `rampPerRound`), and where in the track the clip starts
(`Song.hookStartMs`).

## Run lifecycle

```mermaid
stateDiagram-v2
    [*] --> IN_PROGRESS: POST /api/runs
    IN_PROGRESS --> IN_PROGRESS: round solved, more rounds remain
    IN_PROGRESS --> COMPLETED: livesRemaining hits 0 (daily only)
    IN_PROGRESS --> COMPLETED: roundIndex > maxRounds (daily only)
    IN_PROGRESS --> COMPLETED: no eligible puzzle left to sample
    IN_PROGRESS --> ABANDONED: POST /api/runs/:id/abandon
    IN_PROGRESS --> EXPIRED: sweeper, expiresAt passed
    COMPLETED --> [*]: finalize → score, XP, boards
    ABANDONED --> [*]: no board write
    EXPIRED --> [*]: no board write
```

`COMPLETED` is the only terminal state that writes to a leaderboard. A daily run
that runs out of lives at round 7 still completes — it just scores less. Quitting
mid-run is `ABANDONED` and scores nothing, which is what stops daily players from
rerolling a bad start.

**Lives only end a `DAILY` run.** A bounded attempt is the whole point of the
daily; practice is the opposite. Completing a practice run is not cheap either:
score, streak and round history are all `Run` columns, so the client has nothing
to show afterwards but a fresh run's zeroes — a three-miss game over reads as the
app wiping itself. Practice keeps counting misses and keeps going.

## Round lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: round created at stage 1
    PENDING --> PENDING: wrong guess or skip → stage + 1
    PENDING --> SOLVED: correct guess
    PENDING --> FAILED: attempt 6 used, still unsolved
    SOLVED --> [*]: points awarded, next round
    FAILED --> [*]: livesRemaining - 1 (floored at 0)
```

## Transitions

Every row is one server transaction over a row-locked `Run`.

| Action | Guard | Effect |
| --- | --- | --- |
| `startRun` | for `DAILY`, no existing run for `(player, game, dayKey)` | create `Run`, create round 1, return stage-1 asset URL + run token |
| `guess` (correct) | run `IN_PROGRESS`, round `PENDING`, `attemptsUsed < maxAttempts`, idempotency key unused | round → `SOLVED`, award points/XP, `currentStreak++`, advance cursor or finalize |
| `guess` (wrong) | same | `attemptsUsed++`; if `< maxAttempts` → `stageReached++`, return next asset; else round → `FAILED` |
| `skip` | same | identical to a wrong guess, recorded with `isSkip = true` |
| round → `FAILED` | — | `livesRemaining--` (floored at 0), `currentStreak = 0`; if lives 0 **and** mode is `DAILY` → finalize run |
| `abandon` | run `IN_PROGRESS` | run → `ABANDONED`, `endedAt` set, no board write |
| sweeper | `expiresAt < now()`, still `IN_PROGRESS` | run → `EXPIRED` |

**Correct guess on the last attempt still solves.** Attempt 6 is a real attempt at
stage 6, not a formality.

## Server authority — the non-negotiables

1. **The client never learns the answer of a `PENDING` round.** No `puzzleId`, no
   title, no artist in any response until `outcome != PENDING`. The typeahead is
   backed by a catalog-wide search endpoint that has no idea what the current
   round is.
2. **Audio is one stored object, sliced per stage on the way out.** A puzzle has a
   single `AUDIO_CLIP` covering the full reveal window (7s), and the stage-N
   response is a byte-range prefix of it — `bytes=0-(stageByteOffsets[N-1] - 1)`,
   with the offsets precomputed at ingest. The client is never handed a longer
   buffer than it earned, so there is nothing to scrub ahead into. Two
   consequences that are easy to get wrong:
   - **The clip must be CBR MP3**, not AAC-in-MP4. A truncated MP3 is a valid MP3
     (self-describing frames, no global index); a truncated MP4 will not decode.
   - **`storageKey` must be content-addressed** (use `checksum`). The route
     proxies the range rather than redirecting, but if you ever do sign a direct
     URL, a key like `blank-space-taylor-swift.mp3` *is* the answer.
3. **The client does not send `roundIndex`.** `guess` and `skip` act on
   `Run.currentRoundIndex`. Old rounds are unreachable by construction.
   - The one read that deliberately looks backwards is `audio?reveal=1`, which
     serves the FULL clip for the latest round whose `outcome != PENDING` — the
     answer the result panel is already showing. It still takes no round index
     from the client, and it cannot address a `PENDING` round at all, so it
     cannot be used to hear ahead. It looks backwards rather than at
     `currentRoundIndex` because resolving a round advances that index in the
     same transaction, so the "current" round is already the next one by the
     time the panel renders.
4. **The client does not send stage, attempt number, or score.** All derived from
   `RunRound` + `Guess` rows.
5. **Idempotency.** Every attempt carries a client-generated key, unique on
   `Guess.idempotencyKey`. A retried request returns the stored result instead of
   burning a second attempt. `@@unique([roundId, attemptIndex])` is the backstop
   if a key is ever omitted.
6. **Row lock, not read-then-write.** `SELECT … FOR UPDATE` on the `Run` inside
   the transaction, with `Run.version` incremented as a second guard. Two
   simultaneous submits cannot both advance the ladder.
7. **Run token** on every mutation: raw token in an `Authorization` header,
   compared against `Run.tokenHash`. Owning a player cookie is not enough to
   mutate someone else's run.

## API surface

Next 16 route handlers. `params` is a Promise and `cookies()` / `headers()` are
async — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.

```
POST   /api/runs                      → start a run   { gameSlug, mode }
GET    /api/runs/[runId]              → resume: current round, stage, asset URL
POST   /api/runs/[runId]/guess        → { guessedPuzzleId, idempotencyKey }
POST   /api/runs/[runId]/skip         → { idempotencyKey }
GET    /api/runs/[runId]/audio        → the current round's earned prefix
GET    /api/runs/[runId]/audio?reveal=1 → the whole clip, resolved rounds only
POST   /api/runs/[runId]/abandon
GET    /api/games/[slug]/search       → typeahead over the catalog
GET    /api/games/[slug]/leaderboard  → ?board=DAILY&period=2026-08-19
POST   /api/players/claim             → guest → user merge
```

Typed context via the global `RouteContext` helper:

```ts
export async function POST(request: Request, ctx: RouteContext<'/api/runs/[runId]'>) {
  const { runId } = await ctx.params
  // …
}
```

Attempt responses are one shape, whether the guess was right or wrong:

```ts
type AttemptResult = {
  outcome: 'PENDING' | 'SOLVED' | 'FAILED'
  stageReached: number
  attemptsUsed: number
  attemptsRemaining: number
  nextAssetUrl: string | null      // null once the round resolves
  livesRemaining: number
  runStatus: RunStatus
  points: number | null            // null while PENDING
  reveal: { title: string; artist: string; artworkUrl: string } | null  // only when resolved
}
```

## Scoring

Formula lives in code (`src/lib/game/scoring/v1.ts`), pinned per run by
`Run.scoringVersion`, so rebalancing never rewrites old scores.

```
stageBase   = [1000, 800, 600, 400, 250, 100][stageReached - 1]
depthBonus  = 1 + 0.05 * (roundIndex - 1)           // round 10 is worth 1.45x
streakBonus = 1 + min(0.10 * currentStreak, 0.50)   // consecutive solves, any stage

points = round(stageBase * depthBonus * streakBonus)
xp     = 10 + 4 * (maxAttempts - attemptsUsed)
```

With tiers gone there is no score multiplier — every score on the board came from
the same ten songs, which is the whole reason the board is comparable. `depthBonus`
carries the difficulty reward instead: the later rounds are the obscure ones, so
they pay more. It's steeper than it would be for a 20-round day (0.05 vs 0.03) so
that reaching round 10 still feels worth more than a clean start.

A failed round scores 0 points and 0 XP. XP is deliberately flatter than score —
score is spiky and competitive, XP should feel like steady progress. They are
separate columns; never derive one from the other at read time.

## Puzzle selection

```
targetPopularity = clamp(
  game.startPopularity - game.rampPerRound * (roundIndex - 1),
  game.minPopularity,
  100
)
```

Seeded at `90 / -3.5 / floor 20`, a 10-round day walks 90 → 58.5: round 1 is a
song almost everyone knows, round 10 is genuinely obscure. Ten rounds have to
cover the same span that twenty used to, so the ramp is steep — retune
`rampPerRound` here, not in code.

Sample one active, unblocked puzzle within `±game.sampleWindow` of the target,
excluding:

- puzzles already in this run (`@@unique([runId, puzzleId])` is the hard stop)
- puzzles in `PlayerPuzzleHistory` newer than `Game.puzzleCooldownDays`

Widen the window progressively if the pool comes back empty; log when it does,
because that's your signal the catalog is too thin at that percentile.

Both `targetPopularity` and the sampled `puzzlePopularity` are stored on
`RunRound` so the difficulty curve can be audited later without replaying runs.

## Difficulty self-tuning

`Puzzle.popularity` starts as `seedPopularity` from an external signal. After
~200 plays, recompute from telemetry:

```
earlySolveRate = earlySolveCount / playCount    // solved within first 3 stages
```

Map `earlySolveRate` back onto a percentile and blend toward it rather than
jumping, so one bad week of traffic can't reshuffle the catalog. `seedPopularity`
stays untouched so any retune is reversible.

## Daily challenge

- `dayKey` is a calendar date in one fixed platform timezone (`DAILY_TZ`, e.g.
  `Asia/Kolkata`). Pick it once and never make it per-user — a per-user day means
  no two players share a puzzle set, which defeats the entire point.
- A cron job generates tomorrow's single `DailyChallenge` — one row per game per
  day, holding 10 frozen `DailyChallengePuzzle` entries in order. Generate at
  least a day ahead so a failed job is recoverable before anyone notices.
- `roundCount` is copied from `Game.dailyRounds` at generation time. Changing the
  game from 10 rounds to some other number must never reshape a published day.
- One-per-day is enforced by the database, not by application logic:
  `@@unique([playerId, gameId, dayKey])` on `Run`. Because Postgres treats
  `NULL`s as distinct in unique indexes, practice and endless runs — which leave
  `dayKey` null — are unaffected and unlimited. No partial index required.

## Guest → user claim

1. First request mints a `Player` with `kind = GUEST`; id goes into a signed
   `httpOnly` cookie, mirrored to `localStorage` for recovery.
2. Guests play and rank normally. XP and coins accrue on the guest row.
3. At signup, in one transaction: insert `GuestClaim` (unique on
   `guestPlayerId`), repoint `Run` / `PlayerGameStat` / `PlayerPuzzleHistory` /
   `LeaderboardEntry` to the user row, write a `GUEST_MERGE` ledger entry.
4. The unique on `guestPlayerId` makes the whole thing idempotent and one-way —
   a replayed claim request fails the insert and rolls back cleanly.

Surface the prompt immediately after a strong run, never before: *"That run puts
you #14 this week — create an account to keep it."*

## Board writes

On finalize, upsert `LeaderboardEntry` for each applicable board. Only ranked
runs (`Run.isRanked`) write; practice never does.

| Board | periodKey | Score source |
| --- | --- | --- |
| `DAILY` | `2026-08-19` | that daily run's score |
| `WEEKLY_BEST_RUN` | `2026-W34` | best single run in the ISO week |
| `ALLTIME_BEST_RUN` | `ALL` | best single run ever |
| `ALLTIME_XP` | `ALL` | `PlayerGameStat.xp` |
| `DAILY_STREAK` | `ALL` | `currentDailyStreak` |

Upsert keeps the better row: `score DESC`, then `tieBreakRevealMs ASC`, then
`tieBreakDurationMs ASC`. `rank` is computed on read (window function) and cached
for display — never treated as truth.

## v1 scope

**Ship:** `DAILY` (10 songs) + `PRACTICE`, one board per day, guest play,
server-authoritative rounds, one 7s clip per puzzle range-sliced per stage,
XP/level, share card.

**Schema present but unwired:** `ENDLESS`, `HintUsage`, coins, streak freezes,
weekly/all-time boards.

**Enabling endless later** is just flipping `mode` — the run loop, selection,
scoring, and boards already handle unbounded runs (`maxRounds = null`). That's the
whole reason to keep the engine mode-agnostic now, even though v1 only ships
daily.

**If difficulty options ever come back**, they belong on `Run` as a named preset
resolved to a popularity curve at start time, not as a `tier` column threaded
through five tables and every board key. That threading is what got removed here.

## Prisma 7 setup notes

The schema is written for Prisma 7, which differs from most examples online:

- The generator is `prisma-client`, **not** `prisma-client-js`, and `output` is
  required. Ours generates to `src/generated/prisma` (gitignored), so imports are
  `from '@/generated/prisma/client'` rather than `from '@prisma/client'`.
- `datasource` carries **no `url`**. The connection string lives in
  [`prisma.config.ts`](../prisma.config.ts).
- `PrismaClient` must be constructed with a **driver adapter**; there is no
  built-in engine connection anymore.
- `prisma migrate diff` uses `--to-schema`, not the old `--to-schema-datamodel`.

```bash
npm i @prisma/client @prisma/adapter-pg && npm i -D prisma dotenv
```

```ts
// src/lib/db.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })

// Reuse across dev hot reloads so we don't exhaust the connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Two things the schema deliberately leaves to a raw migration:

- **Trigram search** for the typeahead: `CREATE EXTENSION pg_trgm` plus a GIN
  index on `Song.searchText`. The btree index in the schema is a placeholder.
- **`PlayerPuzzleHistory` cleanup**: a periodic delete past
  `Game.puzzleCooldownDays`, or partitioning if it grows.

Verified against Prisma 7.9.1: schema validates, client generates, and the
migrations produce 16 tables with all three integrity constraints intact
(`Run_playerId_gameId_dayKey_key`, `Guess_roundId_attemptIndex_key`,
`RunRound_runId_puzzleId_key`).

# Performance: why the game felt slow, and what fixed it

The game was not slow because anything was computing hard. It was slow because
almost nothing was computing at all — the server was waiting on the network, over
and over, inside a single request.

## The measurement that explains everything

The database is Neon in `ap-southeast-1` (Singapore). From a development machine
in India:

```
TCP handshake:                          125 ms
Full connect (TLS + auth + Neon wake): 1483 ms
Warm single query (median of 30):       103 ms   (min 71, p90 186)
```

**One query costs ~100 ms.** That number is the whole story, because a
transaction runs on ONE connection and node-postgres queues statements on a
connection rather than pipelining them. Every `await tx.something()` is a
strictly serial round trip.

Confirmed directly — `Promise.all` buys nothing, and collapsing statements does:

```
5 sequential queries in a txn:      701 ms
5 via Promise.all in a txn:         841 ms   <- no pipelining; slightly worse
5 collapsed into 1 CTE statement:   493 ms   <- BEGIN + 1 + COMMIT
```

So the unit to optimise is not queries, or indexes, or payload size. It is
**round trips per interaction**.

## What each interaction actually cost

Counted with `DB_LOG_QUERIES=1` (see below), then priced at ~100 ms each.

| Interaction | Statements before | After |
|---|---|---|
| Start a run | ~7 (nested create = BEGIN + 2 INSERT + COMMIT) | **4** |
| Typeahead keystroke | 2 | **1** |
| Guess, ladder advances | 13 | **3** |
| Guess, round resolves | 17 | **5** |
| Give up | ~65 across **5 HTTP requests** | **5 in 1 request** |

On top of that, the client made a **second** request for audio after every
attempt — two more DB reads plus an R2 fetch, strictly serial after the attempt
response. A round-resolving guess was therefore ~17 round trips plus a ~350 ms
audio fetch: over two seconds before the player heard anything.

Give up was the worst interaction in the app by a wide margin. The client looped
`POST /skip` until the round resolved, so it paid the full ~1.7 s attempt cost up
to six times in sequence — **7–8 seconds** of watching a spinner.

## The five fixes

1. **Collapsed the gameplay transactions onto data-modifying CTEs**
   (`src/lib/game/attempt.ts`). Postgres lets several writes plus their follow-up
   reads travel as one statement. The token check folded into the
   `SELECT ... FOR UPDATE` that was already reading that row; the idempotency
   check merged into `INSERT ... ON CONFLICT DO NOTHING`; `computeRewards` became
   pure, since `roundsSolved` is already a `Run` column and "has a 1-attempt
   solve" is one `EXISTS` subquery in the locking read.

2. **Inlined earned audio in the response.** The transaction already knows which
   stage was unlocked and which object holds it, so the bytes ride along as
   base64 (`InlineAudio`). Stage slices run 6–240 KB, so base64's 33% overhead is
   far cheaper than a round trip. This removed the second request entirely from
   run start, resume, every attempt, and advancing to the next round —
   `nextRound()` now makes **zero** requests.

3. **Give up became one server-side call** (`POST /api/runs/[runId]/giveup`),
   resolving the round and spending every remaining slot in one transaction.

4. **Optimistic attempt slots.** The board used to sit still from the keystroke
   until the response landed, which reads as dropped input. The slot is claimed
   immediately and rendered as in-flight (`•••`) — never as a miss, because the
   verdict genuinely isn't known yet — then settled when the server rules.

5. **Connection pool tuning** (`src/lib/db.ts`). This one was invisible and
   nasty: node-postgres defaults to `min: 0` and `idleTimeoutMillis: 10_000`, so
   an idle connection is **closed after ten seconds**. A player who thought for
   fifteen seconds between guesses paid the full ~1.5 s reconnect on their next
   attempt. That is why the slowness felt erratic rather than constant. `min: 2`
   pins connections open (pg only reaps idle clients above `min`), with a six
   minute idle timeout and TCP keepalive.

Also: the R2 clip cache (`readClipPrefix`) serves the requested range immediately
and warms the full object in the background, so later stages of the same round
come from memory without making stage 1 wait for a 480 KB download.

## Where it landed

Production build, same machine, same ~100 ms-away database:

| | before (derived) | after (measured p50) |
|---|---|---|
| Typeahead keystroke | ~200 ms | **193 ms** |
| Guess, ladder advances | ~1700 ms | **494 ms** |
| Guess, round resolves | ~2100 ms | **~1140 ms** |
| Give up | ~8000 ms | **1137 ms** |
| Advance to next round | ~350 ms | **0 ms** (no request) |

Requests per interaction dropped too: starting a run and resuming one are each a
single request instead of two, and advancing a round makes none at all.

## The remaining 5-10x is a deploy setting, not code

At 3 statements, a guess is ~9 ms of database work and ~300 ms of *waiting for
Singapore*. Latency is now dominated almost entirely by the distance between the
compute and the data.

`vercel.json` pins functions to `sin1` to match the Neon region:

```json
{ "regions": ["sin1"] }
```

Colocated, a round trip is ~1–3 ms instead of ~103 ms, which puts a guess well
under 100 ms end to end. **If you move either the database or the functions,
move both.** A Vercel deploy in `iad1` (the US default) against a Singapore
database would be roughly twice as slow as the numbers above, and no amount of
query tuning would recover it.

### Local development

The ~100 ms round trip cannot be fixed locally — Singapore is Singapore. Options:

- Accept it. The collapse above already made dev ~3x faster.
- Run Postgres locally for development, which takes a round trip to ~0.2 ms.

### On the connection pooler

Neon's pooled endpoint (`...-pooler....`) was tested and **works**, including
interactive transactions with `SELECT ... FOR UPDATE`. It is not enabled, because
interleaved A/B measurement showed it *costs* ~6 ms per query from here:

```
direct: median 102.9 ms
pooled: median 109.0 ms
```

That trade is worth making in serverless, where many short-lived function
instances would otherwise exhaust Postgres connection slots — so **turn it on
when deploying to Vercel**, not for local development. `prisma.config.ts` already
prefers `DIRECT_URL` when set, because PgBouncer in transaction mode cannot run
the session-level statements migrations need. To switch:

```
DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=verify-full"
DIRECT_URL="postgresql://.../neondb?sslmode=verify-full"
```

## Counting round trips yourself

`DB_LOG_QUERIES=1` prints one numbered line per statement with its duration. On a
remote database a count of those lines IS the latency of a request, so it is the
fastest way to catch a regression that reintroduces one:

```bash
DB_LOG_QUERIES=1 npm run dev
```

A guess that advances the ladder should print exactly three lines: the locking
read, the write CTE, and `COMMIT`. If it prints more, something reached for a
convenience query inside the transaction.

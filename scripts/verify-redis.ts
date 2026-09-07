// Prove Redis Cloud works before the leaderboard depends on it.
//
//   npm run verify:redis
//
// Exercises the exact commands the daily board needs, in order: write scores
// with tie-breaks, read the top N back in rank order, look up one player's rank
// without scanning, expire the key, then clean up after itself.
//
// The tie-break encoding is the part worth verifying. A sorted set gives you ONE
// float per member, but the board is ranked by score DESC then reveal-ms ASC —
// two dimensions. Packing both into that one float is the trick the whole board
// rests on, and it either round-trips exactly or it silently misorders players.

import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { disconnectRedis, isRedisConfigured, key, redis } from '../src/lib/redis'

const BOARD = key('_verify', randomBytes(6).toString('hex'))

/// Pack score + tie-break into one sortable float.
///
/// score * 1e6 - revealMs means a higher score always outranks a lower one, and
/// two equal scores are separated by who unlocked less audio. 1e6 is the ceiling
/// on revealMs (~16 minutes) — comfortably above any real run, and small enough
/// that score * 1e6 stays inside the 2^53 a double represents exactly. Go wider
/// and ranks start rounding into each other.
function pack(score: number, revealMs: number): number {
  return score * 1e6 - revealMs
}

function fail(message: string): never {
  console.error(`  FAIL  ${message}`)
  process.exit(1)
}

async function main() {
  if (!isRedisConfigured()) {
    fail('missing REDIS_URL. Set it in .env from the Redis Cloud console, then re-run.')
  }

  // Host only — never print the password sitting in the URL.
  const host = new URL(process.env.REDIS_URL!).host
  console.log(`redis @ ${host}  prefix ${key()}`)

  const client = await redis()
  console.log('  ok    connected')

  const pong = await client.ping()
  if (pong !== 'PONG') fail(`PING returned ${pong}, expected PONG`)
  console.log('  ok    ping')

  try {
    // Three players. Second and third are tied on score and must be split by
    // reveal-ms, which is the case a single-dimension board gets wrong.
    await client.zAdd(BOARD, [
      { value: 'player-a', score: pack(9200, 4000) },
      { value: 'player-b', score: pack(8400, 2000) },
      { value: 'player-c', score: pack(8400, 6000) },
    ])
    console.log('  ok    zadd 3 entries')

    const top = await client.zRangeWithScores(BOARD, 0, -1, { REV: true })
    const order = top.map((entry) => entry.value)
    if (order.join(',') !== 'player-a,player-b,player-c') {
      fail(`board order was ${order.join(',')}, expected player-a,player-b,player-c`)
    }
    console.log(`  ok    top-N in rank order: ${order.join(' > ')}`)

    // b beat c on the tie-break, not on score. If the packing overflowed, these
    // two land on the same float and the order above was luck.
    if (top[1].score === top[2].score) {
      fail('tied scores collapsed to one value — tie-break lost in the float')
    }
    const unpacked = Math.round(top[1].score / 1e6)
    if (unpacked !== 8400) fail(`score unpacked to ${unpacked}, expected 8400`)
    console.log('  ok    tie-break survives the round trip, score unpacks exactly')

    // The read that justifies Redis: one player's rank, no scan.
    const rank = await client.zRevRank(BOARD, 'player-c')
    if (rank !== 2) fail(`zRevRank said ${rank}, expected 2`)
    console.log('  ok    single-player rank lookup')

    // Boards are per-day and must not accumulate forever on a 30MB free tier.
    await client.expire(BOARD, 60)
    const ttl = await client.ttl(BOARD)
    if (ttl < 1) fail(`ttl was ${ttl} after EXPIRE — key would live forever`)
    console.log(`  ok    expire, ttl ${ttl}s`)
  } finally {
    await client.del(BOARD).catch((error: unknown) => {
      console.warn(`  warn  could not clean up ${BOARD}:`, error)
    })
    await disconnectRedis()
  }

  console.log('\nredis is ready.')
}

main().catch(async (error) => {
  console.error(error)
  await disconnectRedis()
  process.exit(1)
})

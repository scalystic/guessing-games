import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/// Connection pool tuning, which turns out to matter as much as query count.
///
/// node-postgres defaults to `min: 0` and `idleTimeoutMillis: 10_000`, so an idle
/// connection is CLOSED after ten seconds. Against a managed Postgres in another
/// region, opening a fresh one costs ~1.5s (TCP + TLS + auth, plus a wake if the
/// instance had autosuspended). A player who thinks for fifteen seconds between
/// guesses was therefore paying a second and a half on their next attempt, on top
/// of the query time — which is why the slowness felt erratic rather than
/// constant.
///
/// `min: 2` pins connections open (pg only reaps idle clients above `min`), the
/// longer idle timeout stops churn during quiet spells, and `keepAlive` stops an
/// idle TCP connection being dropped by something in the middle.
const pool = {
  connectionString: process.env.DATABASE_URL!,
  /// Kept open regardless of idleTimeoutMillis. Two so a second concurrent
  /// request doesn't have to build a connection from scratch.
  min: Number.parseInt(process.env.DB_POOL_MIN ?? '2', 10),
  max: Number.parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  /// Six minutes. Long enough to span a whole round of thinking time.
  idleTimeoutMillis: 360_000,
  /// Fail rather than hang forever if the database is unreachable.
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
}

const adapter = new PrismaPg(pool)

/// Set DB_LOG_QUERIES=1 to print one line per statement.
///
/// Worth keeping: on a remote database each statement is a round trip, so a
/// count of these IS the latency of a request. It is how the gameplay paths were
/// measured down from 13-17 statements per attempt to 4-6, and it is the fastest
/// way to catch a regression that reintroduces one.
const logQueries = process.env.DB_LOG_QUERIES === '1'

function build(): PrismaClient {
  if (!logQueries) return new PrismaClient({ adapter })

  const client = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  })

  let count = 0
  client.$on('query', (event: { query: string; duration: number }) => {
    count++
    const sql = event.query.replace(/\s+/g, ' ').slice(0, 90)
    console.log(`[db ${String(count).padStart(4)}] ${String(event.duration).padStart(5)}ms  ${sql}`)
  })

  return client
}

// Reuse across dev hot reloads so we don't exhaust the connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? build()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

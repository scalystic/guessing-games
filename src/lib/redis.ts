// Deliberately NOT marked `server-only`: scripts/ run outside the react-server
// condition and that package throws there. Nothing here is callable from a
// client component anyway — REDIS_URL has no NEXT_PUBLIC_ prefix, so Next never
// inlines it into the browser bundle and the connect below would just fail.
import { createClient, type RedisClientType } from "redis";

/// Redis Cloud, reached over a plain TCP connection. Backing store for the
/// daily-challenge leaderboard.
///
/// Why Redis and not just Postgres: the board read is "top N by score, plus
/// THIS player's rank", and rank-of-one-row is the expensive half. In Postgres
/// that is a window function over every entry for the day, run on every page
/// view of a page that is by design the most-viewed page in the app. A sorted
/// set answers both in O(log n) with two commands (ZREVRANGE + ZREVRANK) and no
/// scan. LeaderboardEntry in Postgres stays the durable record — Redis is the
/// read path in front of it, and is rebuildable from it.
///
/// Why node-redis and not Upstash's REST client: Redis Cloud speaks RESP over
/// TCP, and this app also has a long-lived Node process (the socket server) that
/// would want the same connection semantics. REST-per-command would add a
/// round trip to every ZADD.
///
/// Serverless caveat, worth knowing before this scales: each warm Vercel lambda
/// holds its own connection, so the ceiling is concurrent-lambdas, not requests.
/// Redis Cloud's free tier caps at 30 connections. That is fine for launch and
/// is the first thing to check if you start seeing ECONNREFUSED under load —
/// the fix then is the connection-pooling proxy on paid plans, not this file.

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Prefix on every key this app writes. The reason it exists: one free Redis
/// Cloud database is a single keyspace with no numbered DBs, so pointing local
/// dev and production at the same instance silently merges their leaderboards.
/// Give each environment its own prefix and they coexist in one database.
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? "cluecade:dev";

/// True when REDIS_URL is set. For health checks and for call sites that should
/// degrade to Postgres rather than throw — see the note on `redis()`.
export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/// Namespace a key. Every caller goes through this; nothing builds a raw key.
export function key(...parts: string[]): string {
  return [KEY_PREFIX, ...parts].join(":");
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// The in-flight or settled connect, memoised — the PROMISE and not the client,
/// because two concurrent requests in the same warm lambda would otherwise both
/// see `null` and open two connections against a 30-connection cap.
///
/// Held on globalThis so `next dev` hot reloads reuse it instead of leaking a
/// connection per edit, the same reason src/lib/db.ts does it for Prisma.
const globalForRedis = globalThis as unknown as {
  redis?: Promise<RedisClientType> | null;
};

function build(): Promise<RedisClientType> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("redis is not configured: missing REDIS_URL");
  }

  const client: RedisClientType = createClient({
    url,
    socket: {
      /// Fail fast rather than hang a request behind a dead endpoint. The
      /// leaderboard is not worth a 30s stall on the daily page.
      connectTimeout: 10_000,
      /// Bounded backoff. Returning an Error instead of a delay makes the
      /// client give up and surface the failure, which is what we want — a
      /// caller that catches can fall back to Postgres. Retrying forever would
      /// instead pile up requests waiting on a connection that isn't coming.
      reconnectStrategy: (retries) =>
        retries > 5 ? new Error("redis: giving up after 5 reconnect attempts")
          : Math.min(retries * 200, 2000),
    },
    /// Managed Redis drops connections it considers idle. A warm lambda can sit
    /// unused for minutes between requests, so ping to keep the socket alive
    /// rather than paying a reconnect on the next player's page load.
    pingInterval: 60_000,
  });

  /// Mandatory, not defensive: node-redis emits 'error' on an EventEmitter, and
  /// an EventEmitter with no 'error' listener THROWS, taking the process down.
  /// A Redis blip must never be able to kill the server.
  client.on("error", (error) => {
    console.error("[redis]", error instanceof Error ? error.message : error);
  });

  return client.connect().then(
    () => client,
    (error) => {
      // Let the next call retry from scratch instead of caching the failure.
      globalForRedis.redis = null;
      throw error;
    },
  );
}

/// Connected client. Throws when REDIS_URL is unset or the connection fails.
///
/// THROWING IS THE INTENDED CONTRACT — callers decide. The leaderboard write
/// path should catch and continue (a lost board update must not fail a player's
/// run submission); the read path should catch and fall back to the Postgres
/// LeaderboardEntry query. Neither should let this reach the user.
export function redis(): Promise<RedisClientType> {
  globalForRedis.redis ??= build();
  return globalForRedis.redis;
}

/// Close the connection. For scripts, which otherwise hang on an open socket.
/// Not for request handlers — those want the connection kept warm.
export async function disconnectRedis(): Promise<void> {
  const pending = globalForRedis.redis;
  if (!pending) return;
  globalForRedis.redis = null;
  try {
    const client = await pending;
    await client.quit();
  } catch {
    // Already down or never came up. Nothing to close.
  }
}

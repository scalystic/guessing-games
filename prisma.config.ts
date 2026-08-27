// Prisma 7 moved the datasource URL out of schema.prisma and into this file.
// Requires: npm i -D prisma dotenv
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Prisma 7 reads the seed command from here, not from package.json.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // DIRECT_URL first so migrations keep working if DATABASE_URL is ever pointed
    // at a connection pooler. PgBouncer in transaction mode cannot run the
    // session-level statements migrations need (advisory locks, CREATE INDEX
    // CONCURRENTLY), so a migration must always reach Postgres directly.
    // Unset by default — DATABASE_URL is direct today.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
})

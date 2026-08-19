// Prisma 7 moved the datasource URL out of schema.prisma and into this file.
// Requires: npm i -D prisma dotenv
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})

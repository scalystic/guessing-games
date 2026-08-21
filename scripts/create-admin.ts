// Grants (or re-asserts) admin access on a Player row. There is no admin
// signup flow by design — this script, or an existing admin, is the only way
// to create one. Idempotent: upserts by email, so re-running with a new
// --password rotates it and re-asserts isAdmin: true.
//
//   npm run create-admin -- --email you@example.com --password "Str0ngPass!1" [--name "Jane Admin"]
//
// CLI args are primary (matches scripts/ingest.ts's parseArgs convention);
// ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars are an optional fallback
// for non-interactive use.

import 'dotenv/config'
import { parseArgs } from 'node:util'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

// Matches src/lib/auth/actions.ts.
const BCRYPT_ROUNDS = 12

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      password: { type: 'string' },
      name: { type: 'string' },
    },
  })

  const email = (values.email ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase()
  const password = values.password ?? process.env.ADMIN_PASSWORD
  const displayName = values.name ?? process.env.ADMIN_NAME ?? 'Admin'

  if (!email || !password) {
    console.error(
      'usage: npm run create-admin -- --email <email> --password <password> [--name <name>]',
    )
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('password must be at least 8 characters')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const player = await prisma.player.upsert({
    where: { email },
    create: { kind: 'USER', email, displayName, passwordHash, isAdmin: true },
    update: { passwordHash, isAdmin: true },
    select: { id: true, email: true },
  })

  // Self-managed auth convention — see signup() in src/lib/auth/actions.ts.
  await prisma.player.update({
    where: { id: player.id },
    data: { authUserId: player.id },
  })

  console.log(`admin ready: ${player.email} (${player.id})`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

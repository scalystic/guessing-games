// Prove object storage works before anything depends on it.
//
//   npm run verify:storage
//
// Exercises the exact operations the game needs, in order: write an object, read
// a PREFIX of it back (the reveal mechanism), confirm the bytes match, confirm a
// missing key reports absent rather than throwing, then clean up after itself.
//
// Byte-range reads are the part worth verifying. Some S3-compatible services
// quietly ignore a Range header and return the whole object, which would work in
// testing and hand every player the full 7s clip at stage 1.

import 'dotenv/config'
import { createHash, randomBytes } from 'node:crypto'
import {
  deleteObject,
  isStorageConfigured,
  objectSize,
  putObject,
  readPrefix,
} from '../src/lib/storage'

const KEY = `_verify/${Date.now()}-${randomBytes(6).toString('hex')}.bin`
const SIZE = 4096
const PREFIX = 512

function fail(message: string): never {
  console.error(`  FAIL  ${message}`)
  process.exit(1)
}

async function main() {
  if (!isStorageConfigured()) {
    fail(
      'missing S3_* vars. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and ' +
        'S3_SECRET_ACCESS_KEY in .env, then re-run.',
    )
  }

  console.log(`bucket ${process.env.S3_BUCKET} @ ${process.env.S3_ENDPOINT}`)

  const body = randomBytes(SIZE)
  const sha256Hex = createHash('sha256').update(body).digest('hex')

  try {
    await putObject(KEY, body, { contentType: 'application/octet-stream', sha256Hex })
    console.log(`  ok    put ${SIZE}B`)

    const size = await objectSize(KEY)
    if (size !== SIZE) fail(`head reported ${size}, expected ${SIZE}`)
    console.log(`  ok    head reports ${size}B`)

    // The one that matters. A service ignoring Range returns SIZE bytes here,
    // and readPrefix rejects the length mismatch.
    const prefix = await readPrefix(KEY, PREFIX)
    if (prefix.length !== PREFIX) {
      fail(`range read returned ${prefix.length}B, expected ${PREFIX}B — Range ignored?`)
    }
    if (!Buffer.from(prefix).equals(body.subarray(0, PREFIX))) {
      fail('range read returned the wrong bytes')
    }
    console.log(`  ok    range read ${PREFIX}B, contents match`)

    // Full-length read, i.e. the last reveal stage.
    const whole = await readPrefix(KEY, SIZE)
    if (!Buffer.from(whole).equals(body)) fail('full read returned the wrong bytes')
    console.log(`  ok    full read ${SIZE}B, contents match`)
  } finally {
    await deleteObject(KEY).catch((error: unknown) => {
      console.warn(`  warn  could not clean up ${KEY}:`, error)
    })
  }

  const afterDelete = await objectSize(KEY)
  if (afterDelete !== null) fail(`${KEY} still present after delete`)
  console.log('  ok    delete, and a missing key reports absent')

  console.log('\nstorage is ready.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

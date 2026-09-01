// Reslice — recompute PuzzleAsset.stageByteOffsets after a revealLadder change.
//
// ###########################################################################
// # YOUTUBE-ONLY: DORMANT. Nothing reads stageByteOffsets any more — rounds
// # stream from YouTube and the stage ladder is a play-window the client
// # applies to the stream, not a set of byte offsets. Changing revealLadder no
// # longer requires reslicing anything, so a ladder change is now just a
// # Game.revealLadder update.
// #
// # Note the one behaviour that went with it: the audio route used to reject a
// # ladderRevision mismatch, which is what made in-flight runs fail fast rather
// # than hear a stale slice. There is no equivalent guard on a YouTube round —
// # a ladder change takes effect for live runs immediately.
// ###########################################################################
//
//   npm run reslice
//
// The stored clips don't change: stage N is a byte-range prefix of one ~30s MP3,
// so a new ladder only needs new frame-boundary offsets for the SAME bytes.
// This script downloads each AUDIO_CLIP, verifies it against the stored
// checksum, recomputes offsets against the game's current ladder, and commits
// the new offsets together with the bumped Game.ladderRevision in one
// transaction. In-flight runs on the old revision fail fast (the audio route
// rejects revision mismatches) instead of hearing a stale slice.
//
// The 15s backup tail past the last rung is what makes this script useful for
// more than reshuffling rungs. Any new ladder up to the stored 30s is reachable
// from bytes already in the bucket — no masters, no re-encode, no re-upload.
// Beyond 30s (or past a clamped clip's real length) computeLadderOffsets refuses,
// and the only way through is a re-ingest.

import 'dotenv/config'
import { createHash } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { computeLadderOffsets } from './lib/mp3'
import { isStorageConfigured, readObject } from '../src/lib/storage'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

function fail(message: string): never {
  console.error(`  FAIL  ${message}`)
  process.exit(1)
}

async function main() {
  if (!isStorageConfigured()) {
    fail('missing S3_* vars in .env')
  }

  const game = await prisma.game.findFirst({ where: { isActive: true } })
  if (!game) fail('no active game found')

  const ladder = game.revealLadder as number[]
  if (!Array.isArray(ladder) || ladder.length !== game.maxAttempts) {
    fail(
      `revealLadder has ${ladder.length} stages but maxAttempts is ${game.maxAttempts}`,
    )
  }
  const nextRevision = game.ladderRevision + 1

  console.log(
    `game ${game.slug} · ladder [${ladder.join(', ')}]ms · ` +
      `ladderRevision ${game.ladderRevision} -> ${nextRevision}`,
  )

  const assets = await prisma.puzzleAsset.findMany({
    where: { kind: 'AUDIO_CLIP', puzzle: { gameId: game.id } },
    select: {
      id: true,
      storageKey: true,
      byteSize: true,
      checksum: true,
      stageByteOffsets: true,
    },
  })
  console.log(`${assets.length} clip(s) to reslice`)

  const updates: Array<{ id: string; offsets: number[] }> = []

  for (const asset of assets) {
    const clip = await readObject(asset.storageKey)

    // The stored object must be exactly what ingest uploaded — otherwise these
    // offsets would describe bytes that aren't there.
    const checksum = createHash('sha256').update(clip).digest('hex')
    if (checksum !== asset.checksum) {
      fail(`${asset.storageKey}: checksum mismatch — object changed since ingest`)
    }

    const lastOld = asset.stageByteOffsets[asset.stageByteOffsets.length - 1]!
    if (clip.length !== asset.byteSize) {
      fail(
        `${asset.storageKey}: object is ${clip.length}B but byteSize is ` +
          `${asset.byteSize} — stale asset row`,
      )
    }
    // The old final offset must land inside the object. It no longer has to EQUAL
    // its length: the clip carries a backup tail past the last rung, so
    // offsets[last] < byteSize is the normal state.
    if (lastOld > clip.length) {
      fail(
        `${asset.storageKey}: old final offset ${lastOld} is past the ${clip.length}B ` +
          `object — stale asset row`,
      )
    }

    // Throws if the new ladder asks for more audio than the object holds, which is
    // the one failure a reslice genuinely cannot fix. The old final offset is NOT
    // asserted against the new one — moving the last rung within the stored 30s is
    // the whole point of keeping a tail.
    const { offsets, actualMs, totalMs } = computeLadderOffsets(clip, ladder)

    const lastNew = offsets[offsets.length - 1]!
    const tailMs = Math.round(totalMs - actualMs[actualMs.length - 1]!)
    console.log(
      `  ok    ${asset.id} [${offsets.join(', ')}]B ` +
        `(stage 1 plays ${actualMs[0]}ms, ${(tailMs / 1000).toFixed(1)}s tail left over` +
        (lastNew === lastOld ? '' : `, final offset ${lastOld} -> ${lastNew}`) +
        `)`,
    )
    updates.push({ id: asset.id, offsets })
  }

  await prisma.$transaction([
    ...updates.map((u) =>
      prisma.puzzleAsset.update({
        where: { id: u.id },
        data: { stageByteOffsets: u.offsets, ladderRevision: nextRevision },
      }),
    ),
    prisma.game.update({
      where: { id: game.id },
      data: { ladderRevision: nextRevision },
    }),
  ])

  console.log(`\ncommitted ${updates.length} reslice(s) at revision ${nextRevision}.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

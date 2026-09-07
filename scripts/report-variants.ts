// The non-original tracks in the catalog, as markdown.
//
//   npm run report:variants                          # to stdout
//   npm run report:variants -- --out docs/x.md
//
// Reads Song.variantType, which scripts/clean-catalog.ts and
// scripts/apply-corrections.ts populate. Regenerating after either of those has
// run gives a current list; nothing here computes a classification of its own,
// so the report can never disagree with the column.
//
// Also reports duplicate title+artist pairs. Not a variant and not something
// this cleanup created — the pairs are one song ingested twice from two
// different store collections — but they surface in the same review and belong
// in the same document.

import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { REVIEW } from './lib/corrections'

const { values } = parseArgs({ options: { out: { type: 'string' } } })

/// Ordered worst-first: a MISMATCH is unusable, an ALTERNATE is merely not the
/// cut a player expects.
const ORDER = [
  'MISMATCH',
  'INSTRUMENTAL',
  'MASHUP',
  'LOFI',
  'REMIX',
  'COVER',
  'LIVE',
  'ALTERNATE',
] as const

const BLURB: Record<string, string> = {
  MISMATCH: 'Not the song the title claims. Only a re-ingest fixes these.',
  INSTRUMENTAL: 'No vocals — karaoke or score. Unguessable: the lyric is the clue.',
  MASHUP: 'Two or more songs stitched together.',
  LOFI: 'Lo-fi flip or slowed + reverb. Right vocal, wrong tempo and key.',
  REMIX: 'Club or DJ re-edit of the original recording.',
  COVER: 'Re-recorded by someone other than the original artist.',
  LIVE: 'Recorded in front of an audience, not in a studio.',
  ALTERNATE: 'A sanctioned alternate cut — reprise, male/female version.',
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const total = await prisma.song.count()
  const variants = await prisma.song.findMany({
    where: { variantType: { not: null } },
    orderBy: [{ variantType: 'asc' }, { title: 'asc' }],
  })

  const lines: string[] = []
  const push = (s = '') => lines.push(s)

  push('# Non-original tracks')
  push()
  push(
    `${variants.length} of ${total} rows are not the original studio recording of their song. ` +
      'Each is flagged in `Song.variantType`, so the sampler and the guess typeahead can exclude ' +
      'them with one predicate.',
  )
  push()
  push('```sql')
  push('-- everything a run should skip')
  push('SELECT * FROM "Song" WHERE "variantType" IS NOT NULL;')
  push('```')
  push()

  const counts = ORDER.map((k) => [k, variants.filter((v) => v.variantType === k).length] as const)
  push('| Kind | Rows | What it means |')
  push('| --- | --- | --- |')
  for (const [kind, n] of counts) {
    if (n) push(`| \`${kind}\` | ${n} | ${BLURB[kind]} |`)
  }
  push()

  for (const kind of ORDER) {
    const rows = variants.filter((v) => v.variantType === kind)
    if (!rows.length) continue

    push(`## ${kind} — ${rows.length}`)
    push()
    push(`${BLURB[kind]}`)
    push()
    push('| Song | Artist | Film | Year | Album it came from |')
    push('| --- | --- | --- | --- | --- |')
    for (const r of rows) {
      const cell = (v: string | number | null) => (v == null ? '—' : String(v).replace(/\|/g, '\\|'))
      push(
        `| ${cell(r.title)} | ${cell(r.artist)} | ${cell(r.movie)} | ${cell(r.releaseYear)} | ${cell(r.album)} |`,
      )
    }
    push()
  }

  // --- Unconfirmed suspects ----------------------------------------------
  const reviewIds = Object.keys(REVIEW)
  const reviewRows = await prisma.song.findMany({ where: { puzzleId: { in: reviewIds } } })

  if (reviewRows.length) {
    push(`## Suspected, not confirmed — ${reviewRows.length}`)
    push()
    push(
      'These are NOT flagged in `variantType`. Each is a well-known film song credited to an ' +
        'unfamiliar artist and released years after the original — a strong hint, but the same ' +
        'description fits a legitimate independent release that reuses a common Hindi phrase as ' +
        'its title. Confirming one means listening to it in the hook editor. Listed so the ' +
        'review has a work-list instead of the whole table.',
    )
    push()
    push('| Song | Artist | Year | Suspected | Why |')
    push('| --- | --- | --- | --- | --- |')
    for (const id of reviewIds) {
      const row = reviewRows.find((r) => r.puzzleId === id)
      if (!row) continue
      const why = REVIEW[id].why.replace(/\|/g, '\\|')
      push(
        `| ${row.title} | ${row.artist} | ${row.releaseYear ?? '—'} | \`${REVIEW[id].suspected}\` | ${why} |`,
      )
    }
    push()
  }

  // --- Duplicates ---------------------------------------------------------
  const all = await prisma.song.findMany({ orderBy: { createdAt: 'asc' } })
  const groups = new Map<string, typeof all>()
  for (const s of all) {
    const key = `${s.title}|${s.artist}`.toLowerCase().replace(/[^a-z0-9|]/g, '')
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const dups = [...groups.values()].filter((g) => g.length > 1)

  if (dups.length) {
    push(`## Duplicates — ${dups.length} pairs`)
    push()
    push(
      'One song ingested twice, once from its soundtrack and once from a compilation. ' +
        'These predate this cleanup — the two rows previously had different store titles ' +
        '(`Dil Chahta Hai` vs `Dil Chahta Hai (From "Dil Chahta Hai")`), so normalising the ' +
        'titles is what made them visible. Both rows carry a distinct `externalId`, i.e. two ' +
        'separate audio masters. Not auto-resolved: choosing which to keep is a call about ' +
        'which cut is better, which needs a listen.',
    )
    push()
    push('| Song | Artist | externalIds |')
    push('| --- | --- | --- |')
    for (const g of dups) {
      push(`| ${g[0].title} | ${g[0].artist} | ${g.map((s) => `\`${s.externalId}\``).join(', ')} |`)
    }
    push()
  }

  const out = lines.join('\n')
  if (values.out) {
    await writeFile(values.out, out)
    console.log(`wrote ${values.out}`)
  } else {
    console.log(out)
  }

  await prisma.$disconnect()
}

main()

// Delete storage objects. Three ways to choose them, all report-only until --apply:
//
//   npm run purge:storage -- --keys ./songs/_r2-keys-before-purge.tsv
//   npm run purge:storage -- --prefix songless/admin-previews/ --apply
//   npm run purge:storage -- --all --apply
//
// --keys takes exact keys and is the safe default: it cannot touch an object a
// live puzzle still points at. Get the list from
// `npm run purge:catalog -- --list-keys` BEFORE purging the database, since the
// PuzzleAsset rows are the only record that those keys exist. It accepts one key
// per line, or the tab-separated `kind\tbytes\tkey` that --list-keys emits.
//
// --prefix and --all sweep whatever is actually in the bucket, which is the only
// way to catch orphans no DB row remembers. They are blunt by design: anything
// under the prefix goes, whether a puzzle needs it or not.
//
// Note on "folders": R2 has none. A key just contains slashes, so an emptied
// prefix stops appearing in the dashboard on its own — there is nothing to
// delete and nothing to keep. The next ingest recreates it by writing a key.

import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { deleteObject, isStorageConfigured, listObjects, objectSize } from '../src/lib/storage'

const { values } = parseArgs({
  options: {
    keys: { type: 'string' },
    prefix: { type: 'string' },
    all: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
})

const modes = [values.keys && 'keys', values.prefix && 'prefix', values.all && 'all'].filter(
  Boolean,
)
if (modes.length !== 1) {
  throw new Error(`Pass exactly one of --keys <file>, --prefix <p>, --all (got: ${modes.join(', ') || 'none'})`)
}
if (!isStorageConfigured()) throw new Error('Storage is not configured (S3_ENDPOINT / S3_BUCKET)')

async function selectKeys(): Promise<{ keys: string[]; source: string }> {
  if (values.keys) {
    const raw = await readFile(values.keys, 'utf8')
    const keys = raw
      .split('\n')
      .map((line) => line.trim().split('\t').pop()!.trim())
      .filter((k) => k.length > 0 && !k.startsWith('#'))
    return { keys, source: values.keys }
  }
  const found = await listObjects(values.prefix)
  const bytes = found.reduce((s, o) => s + o.size, 0)
  return {
    keys: found.map((o) => o.key),
    source: `bucket listing ${values.all ? '(entire bucket)' : `prefix "${values.prefix}"`}` +
      ` — ${(bytes / 1048576).toFixed(2)} MB`,
  }
}

async function main() {
  const selected = await selectKeys()
  const keys = [...new Set(selected.keys)]

  console.log(`${keys.length} unique keys from ${selected.source}`)
  if (keys.length === 0) {
    console.log('nothing to delete.')
    return
  }
  if (!values.apply) {
    for (const k of keys.slice(0, 20)) console.log(`  ${k}`)
    if (keys.length > 20) console.log(`  ... and ${keys.length - 20} more`)
    console.log('\n(report only — pass --apply to delete)')
    return
  }

  let deleted = 0
  let absent = 0
  const failed: string[] = []

  for (const key of keys) {
    try {
      // Report objects that were already gone separately from ones we removed,
      // so a half-swept bucket does not read as a clean run.
      if ((await objectSize(key)) === null) {
        absent += 1
        continue
      }
      await deleteObject(key)
      deleted += 1
    } catch (err) {
      failed.push(`${key}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`deleted=${deleted}  already-absent=${absent}  failed=${failed.length}`)
  for (const f of failed) console.error('  FAILED', f)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

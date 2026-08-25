// Metadata + cover art resolution — masters on disk in, an enriched manifest
// and a folder of normalised cover images out.
//
//   npm run metadata -- --manifest ./ingest/manifest.json              # report only
//   npm run metadata -- --manifest ./ingest/manifest.json --write      # apply
//
// Deliberately a SEPARATE step from ingest, and deliberately writes to the
// manifest rather than to the database.
//
// Two reasons. First, matching a YouTube-tagged file to a catalogue entry is a
// guess — one that is right most of the time and embarrassingly wrong the rest,
// and the manifest is where a human can see and fix it before anything is
// published. Second, ingest is a pure function of the manifest today, and that
// is what makes re-running it safe; a step that silently reached out to a third
// party mid-ingest would break that.
//
// So the flow is: run this, read the report, correct what it got wrong, then run
// ingest. Re-running this is safe — existing values are preserved unless
// --overwrite says otherwise.

import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import {
  ACCEPT_SCORE,
  cleanTitle,
  downloadArtwork,
  lookupItunes,
  readTags,
  searchQueries,
  type ItunesMatch,
} from './lib/metadata'
import { ARTWORK_EXTENSION, ARTWORK_SIZE, encodeArtwork } from './lib/artwork'

/// Loose on purpose. This script reads manifests that ingest would reject —
/// that is the point, it exists to fill in what is missing — so it validates
/// only the fields it needs and passes everything else through untouched.
const TrackSchema = z
  .object({
    file: z.string().min(1),
    title: z.string().optional(),
    artist: z.string().optional(),
    album: z.string().nullish(),
    movie: z.string().nullish(),
    releaseYear: z.number().int().nullish(),
    genres: z.array(z.string()).optional(),
    artworkFile: z.string().nullish(),
    ingestRef: z.string().optional(),
  })
  .passthrough()

const ManifestSchema = z
  .object({
    gameSlug: z.string().default('songless'),
    tracks: z.array(TrackSchema).min(1),
  })
  .passthrough()

type Track = z.infer<typeof TrackSchema>

type Resolution = {
  track: Track
  label: string
  match: ItunesMatch | null
  /// Where the stored cover came from, for the report.
  artworkSource: 'itunes' | 'embedded' | 'none'
  artworkFile: string | null
  artworkBytes: number | null
  artworkNote: string | null
  changes: string[]
  /// True when the match scored below ACCEPT_SCORE, or there was no match at
  /// all. These are the rows a human has to look at.
  needsReview: boolean
}

async function resolveTrack(
  track: Track,
  manifestDir: string,
  artworkDir: string,
  options: { overwrite: boolean; country: string; refresh: boolean; write: boolean },
): Promise<Resolution> {
  const masterPath = resolve(manifestDir, track.file)
  const slug = track.ingestRef ?? basename(track.file, extname(track.file))
  const tags = await readTags(masterPath)

  // The manifest's curated title beats the tag's video title as a scoring
  // target — it is what a human already decided this track is called.
  const target = {
    title: track.title ?? cleanTitle(tags.title ?? slug),
    artist: track.artist ?? tags.artist ?? null,
    // Only a curated album counts. The tag's album is a copy of the video
    // title on these files, so feeding it in would match noise against noise.
    album: track.album ?? null,
  }

  const queries = searchQueries(
    { ...tags, title: track.title ?? tags.title, artist: track.artist ?? tags.artist },
    slug,
  )

  const match = await lookupItunes(queries, target, ARTWORK_SIZE, options.country)
  const trusted = match !== null && match.score >= ACCEPT_SCORE

  const changes: string[] = []
  const set = <K extends keyof Track>(key: K, value: Track[K], current: unknown) => {
    const empty = current === undefined || current === null || current === ''
    if (!empty && !options.overwrite) return
    if (current === value) return
    track[key] = value
    changes.push(`${String(key)}=${JSON.stringify(value)}`)
  }

  // Only a trusted match is allowed to write text fields. A weak match still
  // gets reported so a human can decide, but it must not quietly rename a song.
  if (trusted && match) {
    set('title', match.title, track.title)
    set('artist', match.artist, track.artist)
    set('album', match.album ?? undefined, track.album)
    // Only written when the store actually marked the track as a film track.
    // A null is left as a null rather than filled with the album: not every
    // song is from a film, and `set` would then have to be un-done by hand.
    if (match.movie) set('movie', match.movie, track.movie)
    set('releaseYear', match.year ?? undefined, track.releaseYear)
    if (match.genre && (!track.genres?.length || options.overwrite)) {
      set('genres', [match.genre], undefined)
    }
  }

  // ---- artwork -----------------------------------------------------------
  //
  // A weak text match can still carry usable art, but the risk is asymmetric:
  // the wrong cover is a more obvious error than a slightly-off genre, so the
  // embedded thumbnail is preferred over an untrusted iTunes result.

  const artworkName = `${slug}.${ARTWORK_EXTENSION}`
  const artworkRelative = join('artwork', artworkName)
  const artworkPath = join(artworkDir, artworkName)

  if (track.artworkFile && !options.refresh) {
    return {
      track,
      label: `${track.artist ?? '?'} — ${track.title ?? slug}`,
      match,
      artworkSource: 'none',
      artworkFile: track.artworkFile,
      artworkBytes: null,
      artworkNote: 'kept existing',
      changes,
      needsReview: !trusted,
    }
  }

  let source: Buffer | null = null
  let artworkSource: Resolution['artworkSource'] = 'none'
  let artworkNote: string | null = null

  if (trusted && match?.artworkUrl) {
    try {
      source = await downloadArtwork(match.artworkUrl)
      artworkSource = 'itunes'
    } catch (error) {
      artworkNote = `iTunes artwork failed (${error instanceof Error ? error.message : error})`
    }
  }

  if (!source && tags.picture) {
    source = tags.picture.data
    artworkSource = 'embedded'
    if (!artworkNote && !trusted) artworkNote = 'no trusted match — used embedded thumbnail'
  }

  let artworkFile: string | null = null
  let artworkBytes: number | null = null

  if (source) {
    // Encoded even in report mode — the size and the source dimensions are half
    // of what the report is for — but only written to disk when applying.
    const encoded = await encodeArtwork(source)
    if (options.write) await writeFile(artworkPath, encoded.data)
    artworkFile = artworkRelative
    artworkBytes = encoded.data.length
    track.artworkFile = artworkRelative
    if (!changes.includes(`artworkFile="${artworkRelative}"`)) {
      changes.push(`artworkFile=${JSON.stringify(artworkRelative)}`)
    }
    if (encoded.width < ARTWORK_SIZE) {
      artworkNote = `${artworkNote ? artworkNote + '; ' : ''}source only ${encoded.sourceWidth}x${encoded.sourceHeight}`
    }
  } else {
    artworkNote = artworkNote ?? 'no artwork available'
  }

  return {
    track,
    label: `${track.artist ?? '?'} — ${track.title ?? slug}`,
    match,
    artworkSource,
    artworkFile,
    artworkBytes,
    artworkNote,
    changes,
    needsReview: !trusted,
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      /// Without this the script only reports. Nothing on disk changes.
      write: { type: 'boolean', default: false },
      /// Replace fields the manifest already has. Off by default so a hand
      /// correction survives the next run.
      overwrite: { type: 'boolean', default: false },
      /// Re-fetch covers for tracks that already have one.
      refresh: { type: 'boolean', default: false },
      /// iTunes storefront. Defaults to India — this catalogue is Hindi and
      /// Punjabi, and the US storefront misses or misranks a lot of it.
      country: { type: 'string', default: 'IN' },
      only: { type: 'string' },
    },
  })

  if (!values.manifest) {
    console.error(
      'usage: npm run metadata -- --manifest <path> [--write] [--overwrite] [--refresh] [--country IN] [--only <substring>]',
    )
    process.exit(1)
  }

  const manifestPath = resolve(values.manifest)
  const manifestDir = join(manifestPath, '..')
  const artworkDir = join(manifestDir, 'artwork')

  const manifest = ManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))

  const tracks = values.only
    ? manifest.tracks.filter((t) =>
        `${t.file} ${t.title ?? ''} ${t.ingestRef ?? ''}`
          .toLowerCase()
          .includes(values.only!.toLowerCase()),
      )
    : manifest.tracks

  if (tracks.length === 0) {
    console.error(`no tracks matched --only "${values.only}"`)
    process.exit(1)
  }

  await mkdir(artworkDir, { recursive: true })

  console.log(
    `${tracks.length} track(s) · storefront ${values.country} · artwork ${ARTWORK_SIZE}px` +
      (values.write ? '' : '  (REPORT ONLY — pass --write to apply)'),
  )
  console.log()

  const resolutions: Resolution[] = []
  const failures: string[] = []

  for (const track of tracks) {
    try {
      const resolution = await resolveTrack(track, manifestDir, artworkDir, {
        overwrite: values.overwrite,
        country: values.country,
        refresh: values.refresh,
        write: values.write,
      })
      resolutions.push(resolution)

      const { match } = resolution
      const flag = resolution.needsReview ? 'REVIEW' : 'ok    '
      const scored = match ? `${match.score.toFixed(2)}` : '----'

      console.log(`  ${flag} [${scored}] ${resolution.label}`)
      if (match) {
        console.log(
          `         itunes: ${match.artist} — ${match.title}` +
            (match.album ? ` · ${match.album}` : '') +
            (match.movie ? ` · film ${match.movie}` : '') +
            (match.year ? ` · ${match.year}` : '') +
            `  (t ${match.titleScore.toFixed(2)} / a ${match.artistScore.toFixed(2)}` +
            `${resolution.track.album ? ` / alb ${match.albumScore.toFixed(2)}` : ''})`,
        )
      } else {
        console.log('         itunes: no result')
      }
      const art = resolution.artworkBytes
        ? `${resolution.artworkSource}, ${Math.round(resolution.artworkBytes / 1024)}KB`
        : resolution.artworkSource
      console.log(`         art:    ${art}${resolution.artworkNote ? ` (${resolution.artworkNote})` : ''}`)
      if (resolution.changes.length > 0) {
        console.log(`         set:    ${resolution.changes.join('  ')}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  ERR    ${track.file}\n         ${message}`)
      failures.push(track.file)
    }
  }

  const review = resolutions.filter((r) => r.needsReview)
  const withArt = resolutions.filter((r) => r.artworkFile !== null)

  console.log()
  console.log(
    `${resolutions.length} resolved · ${withArt.length} with artwork · ` +
      `${review.length} need review · ${failures.length} failed`,
  )

  if (review.length > 0) {
    console.log(`\nNeeds review (low or no match — text fields left untouched):`)
    for (const r of review) console.log(`  · ${r.label}`)
    console.log(
      `\nFix title/artist in the manifest and re-run with --only <ref> --overwrite --refresh.`,
    )
  }

  if (values.write) {
    // Written whole rather than patched: the schema is passthrough, so the
    // parsed object still carries every field the manifest came in with.
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`\nwrote ${manifestPath}`)
    if (withArt.length > 0) console.log(`wrote ${withArt.length} cover(s) to ${artworkDir}`)
  } else {
    console.log(`\nNothing written. Re-run with --write to apply.`)
  }

  if (failures.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

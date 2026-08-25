# Catalog ingest

Drop licensed master audio in `masters/`, describe it in a manifest, run the
pipeline. Both `masters/` and any real manifest are gitignored — only this file
and `manifest.example.json` are committed.

```bash
cp ingest/manifest.example.json ingest/manifest.json   # then edit
npm run metadata -- --manifest ./ingest/manifest.json           # report only
npm run metadata -- --manifest ./ingest/manifest.json --write   # fill in + fetch covers
npm run ingest   -- --manifest ./ingest/manifest.json --dry-run
npm run ingest   -- --manifest ./ingest/manifest.json
```

`--dry-run` cuts and encodes every track and prints the stage offsets without
uploading or writing to the database. Worth doing first: it catches a
`hookStartMs` that runs past the end of a master before anything is persisted.

## Metadata and cover art

`npm run metadata` fills in `title`, `artist`, `album`, `movie`, `releaseYear`
and `genres` from the [iTunes Search API](https://itunes.apple.com/search), and
writes a normalised 600×600 WebP cover per track into `artwork/` (gitignored,
same as `masters/`). It only ever writes to the manifest — never to the
database — so there is a review step before anything is published.

Re-running is safe: fields the manifest already has are left alone unless
`--overwrite` is passed, and covers already on disk are kept unless `--refresh`
is passed. Hand corrections survive.

| Flag | Effect |
| --- | --- |
| `--write` | Actually apply. Without it the command only reports. |
| `--overwrite` | Replace fields the manifest already has. |
| `--refresh` | Re-fetch covers for tracks that already have one. |
| `--country` | iTunes storefront. Defaults to `IN`. |
| `--only <substring>` | Restrict to matching tracks — for fixing one entry. |

### Reading the report

Each track prints a combined confidence plus its components, e.g.
`(t 1.00 / a 0.80 / alb 1.00)` for title, artist and album:

- **A match must clear a title gate on its own.** Without one a correct artist
  rescues a wrong song — searching Arijit Singh's "Sitaare" returns his
  "Saware", and a single blended score reads that as a pass.
- **It must also share at least one artist token.** Common titles are what a
  title gate cannot see: two unrelated tracks called "Wishes" both score a
  perfect 1.00 on title alone.
- **The album is a tie-break, not a gate.** A store lists the same recording on
  the film soundtrack *and* on a dozen compilations, all equally valid on title
  and artist. Without this the cover ends up being some greatest-hits sleeve.
- **`movie` is only filled when the store said it is a film track** — either the
  track name carries `(From "…")` or the collection is marked a motion picture
  soundtrack. Printed as `· film <name>`. Anything else stays null rather than
  assuming the collection name is a film, because for a single it is not one;
  fill those in by hand.

Anything that fails a gate is printed as `REVIEW` and its text fields are left
untouched; it falls back to the artwork embedded in the master, if there is any.
Fix `title`/`artist` by hand and re-run with `--only <ref> --overwrite --refresh`.

Note that art embedded in a master by a downloader is a **video thumbnail** —
16:9, often with burned-in text — not cover art. It is a fallback, not a
substitute.

## What the pipeline does per track

Cuts a **30000ms** window starting at `hookStartMs`, normalises it to -16 LUFS,
encodes a bare CBR MP3 (mono, 128kbps, no Xing/ID3 headers), walks the frame
headers to find the byte offset of each reveal stage, uploads it under a
content-addressed key, and upserts `Puzzle` + `Song` + `PuzzleAsset`.

The stored clip is **twice as long as the ladder can unlock**. The reveal ladder
tops out at 15s (`REVEAL_LADDER` in [`prisma/seed.ts`](../prisma/seed.ts)); the
remaining 15s is a backup tail, and it buys two things:

- **The ladder becomes a real data tunable.** `npm run reslice` rescans the
  stored frames and writes new offsets, but it can only point at audio already
  in the bucket. When the clip ended exactly at the last rung, *any* upward
  change to the ladder meant fetching every master, re-encoding and re-uploading
  the whole catalog. Now anything up to 30s is a reslice.
- **The result panel gets the whole 30s.** `?reveal=1` serves `byteSize`, not the
  last rung, so after a round resolves the player hears well past what the round
  could have unlocked.

Nothing in play can reach the tail — in-play stages are capped at
`stageByteOffsets[stageReached - 1]`, server-side.

The window is **clamped per track** to whatever the master has left after
`hookStartMs`; a hook 20s from the end yields a shorter clip and logs `CLAMPED`,
not a failure. Dropping below the ladder's 15s is the only fatal case.

When the track has an `artworkFile`, the cover is uploaded alongside it — as-is,
with no re-encoding, since `npm run metadata` owns the format — and recorded as
a second `PuzzleAsset` with `kind: IMAGE`. Its key is content-addressed for the
same reason the audio's is: **the cover is the answer**, so a key built from the
title would give the round away to anyone reading a URL. It is served only after
a round resolves, by `/api/runs/[runId]/artwork`.

Re-running is safe. The upsert key is `(gameId, ingestSource, ingestRef)`, so
fixing a title or retuning `hookStartMs` and re-running updates in place.
Live telemetry (`playCount`, `solveRate`, and `popularity` once it has been
retuned) is deliberately left alone by an update.

## Manifest fields

| Field | Required | Notes |
| --- | --- | --- |
| `file` | yes | Path to the master, **relative to the manifest file**. Any format ffmpeg reads. |
| `title` | yes | Shown on reveal, and half of the typeahead's search text. |
| `artist` | yes | Other half of the search text. |
| `album` | no | The store's collection name, verbatim — e.g. `Saiyaara (Original Motion Picture Soundtrack)`. |
| `movie` | no | Bare film title, **only if the song is from a film**. Left null for a single or a non-film album. |
| `releaseYear` | no | Drives the decade hint. |
| `genres` | no | Array. First entry is used as the genre hint. |
| `aliases` | no | Alternate titles the typeahead should also match. |
| `hookStartMs` | no (default 0) | Where the reveal ladder starts. See below. |
| `seedPopularity` | yes | 0-100 recognisability **within this catalog**. See below. |
| `isrc` / `externalId` | no | Provenance / dedupe against an external catalog. |
| `licenseSource` | yes | Who cleared it. Required so a rights audit isn't guesswork. |
| `ingestSource` | yes | Where the master came from (`manual`, a distributor name, …). |
| `ingestRef` | yes | Stable id within that source. Part of the upsert key — **do not renumber these**, or a re-run creates duplicate puzzles instead of updating. |
| `artworkFile` | no | Pre-encoded square cover, relative to the manifest. Written by `npm run metadata`. Omit it and the puzzle simply has no art. |

## The two fields that decide whether the game is any good

### `hookStartMs`

Stage 1 is **400ms**. If that lands on an intro pad or silence, the round is
unplayable for everyone; if it lands on the vocal hook, recognition is instant.
This is one of only two difficulty levers, so it is worth scrubbing each track
by hand rather than leaving it at 0.

Constraint: `hookStartMs + 15000` (the ladder's last rung, **not** the 30s clip
window) must be within the master's length, or the track fails with a clear
error. Between 15s and 30s the clip is simply shorter and logs `CLAMPED`.

Note two things the pipeline cannot fix, both documented at the top of
[`scripts/ingest.ts`](../scripts/ingest.ts): every in-play stage is a byte prefix
so it ends abruptly (the client ramps the gain down instead), and LAME pads ~13ms
of silence at the head of every clip, identically for every track.

### `seedPopularity`

Difficulty ramps *within* a run: round 1 targets popularity 90 and each later
round slides toward obscurity, sampling **±5** around its target.

For the seeded `songless` config (10 daily rounds, ramp -3.5/round, floor 20)
the ten targets are:

```
round    1     2     3     4     5     6     7     8     9    10
target  90.0  86.5  83.0  79.5  76.0  72.5  69.0  65.5  62.0  58.5
```

So a full 10-round day draws from roughly **53-95**. Practical guidance:

- **Spread the values.** Ten tracks all at 90 means rounds 4-10 fall back to a
  widened window and start repeating. Aim for a handful of tracks in every
  5-point band across 53-95.
- **~30 tracks is the realistic floor** for a 10-round day that doesn't repeat,
  and more is better — `puzzleCooldownDays` is 45, so a returning player won't
  see the same puzzle again for six weeks and needs fresh material.
- **Rank, don't score.** 90 means "nearly everyone knows this", 55 means "you'd
  know it if you like the genre". It is a ranking within *this* catalog, not an
  absolute chart position.

When the catalog is too thin at a percentile the selector widens its window and
logs `[selection] fell back to …`. That warning in the server log is the signal
to add tracks around that band.

## Verifying

`npm run verify:storage` proves the bucket does byte-range reads correctly
before any of this matters — some S3-compatible services quietly ignore a Range
header and return the whole object, which would hand every player the full 30s
clip at stage 1.

After an ingest, the per-track line prints the stored length split into playable
and backup, then each stage as `ms/bytes`. Stage 1 should be roughly 6KB and
stage 6 roughly 240KB, against a stored object of roughly 480KB. The last offset
is **strictly less than** the object's size — the difference is the backup tail.
A stage 6 offset that equals `byteSize` means the clip was cut by the old
pipeline and has no tail.

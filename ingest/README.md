# Catalog ingest

Drop licensed master audio in `masters/`, describe it in a manifest, run the
pipeline. Both `masters/` and any real manifest are gitignored — only this file
and `manifest.example.json` are committed.

```bash
cp ingest/manifest.example.json ingest/manifest.json   # then edit
npm run ingest -- --manifest ./ingest/manifest.json --dry-run
npm run ingest -- --manifest ./ingest/manifest.json
```

`--dry-run` cuts and encodes every track and prints the stage offsets without
uploading or writing to the database. Worth doing first: it catches a
`hookStartMs` that runs past the end of a master before anything is persisted.

## What the pipeline does per track

Cuts a 7000ms window starting at `hookStartMs`, normalises it to -16 LUFS,
encodes a bare CBR MP3 (mono, 128kbps, no Xing/ID3 headers), walks the frame
headers to find the byte offset of each reveal stage, uploads it under a
content-addressed key, and upserts `Puzzle` + `Song` + `PuzzleAsset`.

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
| `album` | no | Film title, for Bollywood tracks. |
| `releaseYear` | no | Drives the decade hint. |
| `genres` | no | Array. First entry is used as the genre hint. |
| `aliases` | no | Alternate titles the typeahead should also match. |
| `hookStartMs` | no (default 0) | Where the reveal ladder starts. See below. |
| `seedPopularity` | yes | 0-100 recognisability **within this catalog**. See below. |
| `isrc` / `externalId` | no | Provenance / dedupe against an external catalog. |
| `licenseSource` | yes | Who cleared it. Required so a rights audit isn't guesswork. |
| `ingestSource` | yes | Where the master came from (`manual`, a distributor name, …). |
| `ingestRef` | yes | Stable id within that source. Part of the upsert key — **do not renumber these**, or a re-run creates duplicate puzzles instead of updating. |

## The two fields that decide whether the game is any good

### `hookStartMs`

Stage 1 is **200ms**. If that lands on an intro pad or silence, the round is
unplayable for everyone; if it lands on the vocal hook, recognition is instant.
This is one of only two difficulty levers, so it is worth scrubbing each track
by hand rather than leaving it at 0.

Constraint: `hookStartMs + 7000` must be within the master's length, or the
track fails with a clear error.

Note two things the pipeline cannot fix, both documented at the top of
[`scripts/ingest.ts`](../scripts/ingest.ts): stages 1-5 are byte prefixes so
they end abruptly (the client ramps the gain down instead), and LAME pads ~13ms
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
header and return the whole object, which would hand every player the full 7s
clip at stage 1.

After an ingest, the per-track line prints each stage as `ms/bytes`. Stage 1
should be roughly 3KB and stage 6 roughly 112KB; the last offset always equals
the stored object's size.

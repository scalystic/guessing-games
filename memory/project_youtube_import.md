---
name: project-youtube-import
description: YouTube playlist import + streaming — songs play directly from YouTube via IFrame Player API, no yt-dlp or S3 audio storage needed
metadata:
  type: project
---

YouTube songs stream directly from YouTube. Import only saves metadata to DB.

**Why:** User wants a large, growing catalog without managing audio storage — just paste a playlist and songs are playable immediately.

**How to apply:** When the user asks about YouTube import, playlist features, or audio streaming, refer to these files.

## Files

- `src/app/api/admin/youtube/playlist/route.ts` — GET /api/admin/youtube/playlist?url= (YouTube Data API v3)
- `src/app/api/admin/youtube/import/route.ts` — POST /api/admin/youtube/import (saves metadata only, no yt-dlp)
- `src/app/admin/(protected)/songs/import-youtube-modal.tsx` — 3-step modal (URL → select → progress)
- `src/lib/game/selection.ts` — samplePuzzle now includes YouTube songs (LEFT JOIN on PuzzleAsset, playable if externalId set)
- `src/lib/game/attempt.ts` — AttemptResult includes youtubeVideoId + hookStartMs
- `src/app/api/runs/route.ts` — POST /api/runs returns youtubeVideoId + hookStartMs
- `src/app/api/runs/[runId]/route.ts` — GET /api/runs/[runId] current round has youtubeVideoId + hookStartMs
- `src/lib/api/runs.ts` — client types updated (StartedRun, AttemptResult, RunState.current)
- `src/hooks/useMelodleGame.ts` — tracks youtubeVideoId/hookStartMs state, skips audio loading for YouTube rounds
- `src/components/PlayerBar.tsx` — YouTube IFrame Player via hidden div, seekTo(hookStartMs) + play for revealMs then pause

## Architecture

### Import (fast — ~1 second per song)
1. Admin pastes playlist URL → preview API fetches up to 200 videos
2. Admin selects songs → click Import
3. For each video: save Puzzle + Song to DB with `externalId = videoId` (no audio download)
4. Thumbnail optionally uploaded as IMAGE PuzzleAsset if storage configured

### Playback
- `samplePuzzle` selects YouTube songs when they have `Song.externalId IS NOT NULL AND PuzzleAsset.storageKey IS NULL`
- Run APIs return `youtubeVideoId` + `hookStartMs` for YouTube rounds
- `PlayerBar` creates a hidden YouTube iframe; on Play click: `seekTo(hookStartMs/1000)` → `playVideo()` → after `revealMs` ms `pauseVideo()`
- Reveal ladder works identically — each stage just plays longer from hookStartMs

### Data model
- `Puzzle.ingestSource = 'youtube'`, `Puzzle.ingestRef = videoId`
- `Song.externalId = videoId`, `Song.hookStartMs` = where hook starts in video
- NO PuzzleAsset for AUDIO_CLIP on YouTube songs
- YouTube songs + stored songs can coexist in the same catalog/run

## Requirements
- `YOUTUBE_API_KEY` in .env (for playlist preview only)
- No yt-dlp, no ffmpeg, no S3 audio required for import
- S3 optional (only used for thumbnail artwork if configured)

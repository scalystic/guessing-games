# Graph Report - /home/ptspl19/Desktop/git-projects/SaaS/guessing-games  (2026-08-21)

## Corpus Check
- Corpus is ~48,721 words - fits in a single context window. You may not need a graph.

## Summary
- 612 nodes · 1149 edges · 30 communities (24 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Admin Dashboard and APIs|Admin Dashboard and APIs]]
- [[_COMMUNITY_Core Game Interaction UI|Core Game Interaction UI]]
- [[_COMMUNITY_Home and Engagement UI|Home and Engagement UI]]
- [[_COMMUNITY_Guest Merge and Run APIs|Guest Merge and Run APIs]]
- [[_COMMUNITY_Audio Ingestion Pipeline|Audio Ingestion Pipeline]]
- [[_COMMUNITY_User Authentication UI|User Authentication UI]]
- [[_COMMUNITY_Admin Authentication UI|Admin Authentication UI]]
- [[_COMMUNITY_Game Engine Rules|Game Engine Rules]]
- [[_COMMUNITY_Round and Attempt Engine|Round and Attempt Engine]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_Project Scripts|Project Scripts]]
- [[_COMMUNITY_Admin Song Library|Admin Song Library]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Game Catalog Pages|Game Catalog Pages]]
- [[_COMMUNITY_Audio Hook Detection|Audio Hook Detection]]
- [[_COMMUNITY_Project Docs and Assets|Project Docs and Assets]]
- [[_COMMUNITY_Song Editor|Song Editor]]
- [[_COMMUNITY_Run Lifecycle and Boards|Run Lifecycle and Boards]]
- [[_COMMUNITY_Database Seeding|Database Seeding]]
- [[_COMMUNITY_Root Layout and Typography|Root Layout and Typography]]
- [[_COMMUNITY_Next.js Agent Guidance|Next.js Agent Guidance]]
- [[_COMMUNITY_Admin Creation Script|Admin Creation Script]]
- [[_COMMUNITY_Database Search Maintenance|Database Search Maintenance]]
- [[_COMMUNITY_ESLint Configuration|ESLint Configuration]]
- [[_COMMUNITY_Next.js Configuration|Next.js Configuration]]
- [[_COMMUNITY_PostCSS Configuration|PostCSS Configuration]]
- [[_COMMUNITY_Document Icon Asset|Document Icon Asset]]
- [[_COMMUNITY_Globe Icon Asset|Globe Icon Asset]]

## God Nodes (most connected - your core abstractions)
1. `internalErrorJson()` - 32 edges
2. `jsonOk()` - 29 edges
3. `jsonError()` - 26 edges
4. `scripts` - 23 edges
5. `compilerOptions` - 16 edges
6. `createSession()` - 14 edges
7. `getSession()` - 14 edges
8. `getAdminUser()` - 11 edges
9. `POST()` - 10 edges
10. `getThemeColor()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Logo` --conceptually_related_to--> `Next.js`  [INFERRED]
  public/next.svg → README.md
- `Vercel Triangle Logo` --conceptually_related_to--> `Vercel Platform`  [INFERRED]
  public/vercel.svg → README.md
- `Browser Window Icon` --conceptually_related_to--> `Guessing Games Admin Console`  [INFERRED]
  public/window.svg → .playwright-mcp/page-2026-08-21T11-29-22-901Z.yml
- `main()` --calls--> `resolve()`  [INFERRED]
  scripts/detect-hooks.ts → src/lib/api/client.ts
- `main()` --calls--> `resolve()`  [INFERRED]
  scripts/ingest.ts → src/lib/api/client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Run and Round Gameplay Flow** — docs_game_engine_run, docs_game_engine_round, docs_game_engine_attempt, docs_game_engine_reveal_stage, docs_game_engine_puzzle [EXTRACTED 1.00]
- **Server-Authoritative Safety Controls** — docs_game_engine_server_authority, docs_game_engine_audio_range_prefix, docs_game_engine_content_addressed_storage, docs_game_engine_idempotency, docs_game_engine_row_locking, docs_game_engine_run_token [EXTRACTED 1.00]
- **Catalog Audio Artifact Pipeline** — ingest_readme_catalog_ingest, ingest_readme_manifest, ingest_readme_audio_processing, ingest_readme_hook_start_ms, ingest_readme_stage_byte_offsets, docs_game_engine_content_addressed_storage [INFERRED 0.95]

## Communities (30 total, 6 thin omitted)

### Community 0 - "Admin Dashboard and APIs"
Cohesion: 0.08
Nodes (52): persist(), AddSongModal(), Props, POST(), POST(), POST(), GET(), generateStaticParams() (+44 more)

### Community 1 - "Core Game Interaction UI"
Cohesion: 0.05
Nodes (53): AttemptTimeline(), Props, COLORS, Confetti(), GuessAutocomplete(), Props, formatMs(), PlayerBar() (+45 more)

### Community 2 - "Home and Engagement UI"
Cohesion: 0.05
Nodes (40): Achievement, ACHIEVEMENTS, SessionStats, Challenge(), DailyHit(), HeroBanner(), HowToPlayList(), Leaderboard() (+32 more)

### Community 3 - "Guest Merge and Run APIs"
Cohesion: 0.08
Nodes (36): GET(), BodySchema, clientIp(), POST(), RUN_TTL_MINUTES, beatsEntry(), BoardScore, claimGuestProgress() (+28 more)

### Community 4 - "Audio Ingestion Pipeline"
Cohesion: 0.10
Nodes (36): encodeClip(), LoudnessStats, LoudnessStatsSchema, LOUDNORM, main(), ManifestSchema, measureLoudness(), prepare() (+28 more)

### Community 5 - "User Authentication UI"
Cohesion: 0.10
Nodes (24): AuthLayout(), LoginForm(), metadata, metadata, SignupForm(), UserNavProps, Home(), THEMES (+16 more)

### Community 6 - "Admin Authentication UI"
Cohesion: 0.10
Nodes (23): AdminLoginForm(), metadata, AdminProtectedLayout(), AdminSidebar(), NAV_ITEMS, NavItem, AdminTopbar(), Props (+15 more)

### Community 7 - "Game Engine Rules"
Cohesion: 0.08
Nodes (31): Attempt, AttemptResult Response Contract, Earned Audio Byte-Range Prefix, CBR MP3 Reveal Asset, Content-Addressed Audio Storage, Frozen Daily Challenge, Daily Mode, Within-Run Popularity Difficulty Curve (+23 more)

### Community 8 - "Round and Attempt Engine"
Cohesion: 0.10
Nodes (27): CurrentRound, GET(), PastRound, RevealedSong, toLadder(), advance(), AttemptError, AttemptInput (+19 more)

### Community 9 - "Project Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, @aws-sdk/client-s3, bcryptjs, jose, music-metadata, next, @prisma/adapter-pg, @prisma/client (+21 more)

### Community 10 - "Project Scripts"
Cohesion: 0.09
Nodes (23): scripts, build, create-admin, db:format, db:generate, db:migrate, db:migrate:create, db:migrate:deploy (+15 more)

### Community 11 - "Admin Song Library"
Cohesion: 0.15
Nodes (16): DeleteSongButton(), Props, SongsPage(), SORT_VALUES, STATUS_VALUES, buildHref(), Counts, EMPTY_COUNTS (+8 more)

### Community 12 - "TypeScript Configuration"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "Game Catalog Pages"
Cohesion: 0.17
Nodes (11): formatSeconds(), GameView(), generateMetadata(), Page(), Page(), detailSelect, GameDetail, GameSummary (+3 more)

### Community 14 - "Audio Hook Detection"
Cohesion: 0.27
Nodes (12): detect(), Detection, formatMs(), main(), ManifestSchema, momentaryLoudness(), percentile(), probeDurationMs() (+4 more)

### Community 15 - "Project Docs and Assets"
Cohesion: 0.18
Nodes (11): Guessing Games Admin Console, Admin Sign-In Form, Next.js Dev Tools Control, Next.js Logo, Vercel Triangle Logo, Browser Window Icon, create-next-app, Geist Font (+3 more)

### Community 16 - "Song Editor"
Cohesion: 0.22
Nodes (3): FieldValues, Props, SongFormInitial

### Community 17 - "Run Lifecycle and Boards"
Cohesion: 0.40
Nodes (6): Abandoned Run State, Completed Run State, Expired Run State, Guest-to-User Claim Transaction, Leaderboard Finalization Writes, Run Lifecycle State Machine

### Community 18 - "Database Seeding"
Cohesion: 0.33
Nodes (4): adapter, prisma, REVEAL_LADDER, SONGLESS

### Community 19 - "Root Layout and Typography"
Cohesion: 0.33
Nodes (4): geistMono, geistSans, metadata, poppins

### Community 20 - "Next.js Agent Guidance"
Cohesion: 0.50
Nodes (4): Next.js Agent Rules Generator, Package-Local Next.js Guides, Next.js Breaking-Change Guidance, AGENTS.md Instructions

### Community 22 - "Database Search Maintenance"
Cohesion: 0.67
Nodes (3): Player Puzzle History Cleanup, Prisma 7 Setup, PostgreSQL Trigram Typeahead Search

## Knowledge Gaps
- **205 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+200 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolve()` connect `Core Game Interaction UI` to `Audio Ingestion Pipeline`, `Audio Hook Detection`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `main()` connect `Audio Hook Detection` to `Core Game Interaction UI`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _214 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Dashboard and APIs` be split into smaller, more focused modules?**
  _Cohesion score 0.07525807525807526 - nodes in this community are weakly interconnected._
- **Should `Core Game Interaction UI` be split into smaller, more focused modules?**
  _Cohesion score 0.054274084124830396 - nodes in this community are weakly interconnected._
- **Should `Home and Engagement UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05222734254992319 - nodes in this community are weakly interconnected._
- **Should `Guest Merge and Run APIs` be split into smaller, more focused modules?**
  _Cohesion score 0.0821256038647343 - nodes in this community are weakly interconnected._
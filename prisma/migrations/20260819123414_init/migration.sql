-- CreateEnum
CREATE TYPE "PlayerKind" AS ENUM ('GUEST', 'USER');

-- CreateEnum
CREATE TYPE "DifficultyTier" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('AUDIO_CLIP', 'IMAGE', 'VIDEO_CLIP', 'TEXT_SNIPPET');

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('DAILY', 'PRACTICE', 'ENDLESS');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RoundOutcome" AS ENUM ('PENDING', 'SOLVED', 'FAILED');

-- CreateEnum
CREATE TYPE "HintType" AS ENUM ('DECADE', 'GENRE', 'FIRST_LETTER', 'ARTIST', 'FIFTY_FIFTY', 'EXTRA_LIFE');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('XP_EARNED', 'COIN_EARNED', 'COIN_SPENT', 'GUEST_MERGE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('DAILY', 'WEEKLY_BEST_RUN', 'ALLTIME_BEST_RUN', 'ALLTIME_XP', 'DAILY_STREAK');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "kind" "PlayerKind" NOT NULL DEFAULT 'GUEST',
    "displayName" TEXT,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "authUserId" TEXT,
    "email" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "countryCode" CHAR(2),
    "timezone" TEXT,
    "createdIpHash" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestClaim" (
    "id" TEXT NOT NULL,
    "guestPlayerId" TEXT NOT NULL,
    "userPlayerId" TEXT NOT NULL,
    "xpMerged" INTEGER NOT NULL DEFAULT 0,
    "coinsMerged" INTEGER NOT NULL DEFAULT 0,
    "runsMerged" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "livesPerRun" INTEGER NOT NULL DEFAULT 3,
    "dailyRounds" INTEGER NOT NULL DEFAULT 20,
    "revealLadder" JSONB NOT NULL,
    "scoringVersion" INTEGER NOT NULL DEFAULT 1,
    "puzzleCooldownDays" INTEGER NOT NULL DEFAULT 45,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTier" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tier" "DifficultyTier" NOT NULL,
    "startPopularity" INTEGER NOT NULL,
    "rampPerRound" DOUBLE PRECISION NOT NULL,
    "minPopularity" INTEGER NOT NULL DEFAULT 2,
    "sampleWindow" INTEGER NOT NULL DEFAULT 4,
    "scoreMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "unlockAtLevel" INTEGER NOT NULL DEFAULT 1,
    "trialRuns" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GameTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "popularity" INTEGER NOT NULL,
    "seedPopularity" INTEGER NOT NULL,
    "difficultyTier" "DifficultyTier",
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "solveCount" INTEGER NOT NULL DEFAULT 0,
    "earlySolveCount" INTEGER NOT NULL DEFAULT 0,
    "solveRate" DOUBLE PRECISION,
    "retunedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "licenseSource" TEXT,
    "ingestSource" TEXT,
    "ingestRef" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleAsset" (
    "id" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "durationMs" INTEGER,
    "byteSize" INTEGER,
    "checksum" TEXT,

    CONSTRAINT "PuzzleAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Song" (
    "puzzleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "releaseYear" INTEGER,
    "decade" INTEGER,
    "genres" TEXT[],
    "durationMs" INTEGER,
    "hookStartMs" INTEGER NOT NULL DEFAULT 0,
    "isrc" TEXT,
    "externalId" TEXT,
    "aliases" TEXT[],
    "searchText" TEXT,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("puzzleId")
);

-- CreateTable
CREATE TABLE "DailyChallenge" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tier" "DifficultyTier" NOT NULL,
    "dayKey" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "roundCount" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengePuzzle" (
    "dailyChallengeId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "targetPopularity" INTEGER,

    CONSTRAINT "DailyChallengePuzzle_pkey" PRIMARY KEY ("dailyChallengeId","roundIndex")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "mode" "RunMode" NOT NULL,
    "tier" "DifficultyTier" NOT NULL,
    "dayKey" TEXT,
    "dailyChallengeId" TEXT,
    "seed" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentRoundIndex" INTEGER NOT NULL DEFAULT 1,
    "livesRemaining" INTEGER NOT NULL,
    "maxRounds" INTEGER,
    "score" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "roundsSolved" INTEGER NOT NULL DEFAULT 0,
    "roundsFailed" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "totalRevealMs" INTEGER NOT NULL DEFAULT 0,
    "scoringVersion" INTEGER NOT NULL,
    "isRanked" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "clientIpHash" TEXT,
    "userAgentHash" TEXT,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunRound" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "outcome" "RoundOutcome" NOT NULL DEFAULT 'PENDING',
    "stageReached" INTEGER NOT NULL DEFAULT 1,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "targetPopularity" INTEGER,
    "puzzlePopularity" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "solveDurationMs" INTEGER,

    CONSTRAINT "RunRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guess" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "attemptIndex" INTEGER NOT NULL,
    "stageAtGuess" INTEGER NOT NULL,
    "guessedPuzzleId" TEXT,
    "rawInput" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "isSkip" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HintUsage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "roundId" TEXT,
    "type" "HintType" NOT NULL,
    "coinCost" INTEGER NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HintUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "xpDelta" INTEGER NOT NULL DEFAULT 0,
    "coinDelta" INTEGER NOT NULL DEFAULT 0,
    "runId" TEXT,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tier" "DifficultyTier",
    "runsPlayed" INTEGER NOT NULL DEFAULT 0,
    "roundsPlayed" INTEGER NOT NULL DEFAULT 0,
    "roundsSolved" INTEGER NOT NULL DEFAULT 0,
    "bestRunScore" INTEGER NOT NULL DEFAULT 0,
    "bestDailyScore" INTEGER NOT NULL DEFAULT 0,
    "bestRoundStreak" INTEGER NOT NULL DEFAULT 0,
    "currentDailyStreak" INTEGER NOT NULL DEFAULT 0,
    "longestDailyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedDayKey" TEXT,
    "streakFreezesLeft" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGameStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPuzzleHistory" (
    "playerId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "lastOutcome" "RoundOutcome",
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPuzzleHistory_pkey" PRIMARY KEY ("playerId","puzzleId")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "boardType" "BoardType" NOT NULL,
    "tier" "DifficultyTier",
    "periodKey" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tieBreakRevealMs" INTEGER,
    "tieBreakDurationMs" INTEGER,
    "runId" TEXT,
    "rank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_handle_key" ON "Player"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Player_authUserId_key" ON "Player"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email");

-- CreateIndex
CREATE INDEX "Player_kind_lastSeenAt_idx" ON "Player"("kind", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestClaim_guestPlayerId_key" ON "GuestClaim"("guestPlayerId");

-- CreateIndex
CREATE INDEX "GuestClaim_userPlayerId_idx" ON "GuestClaim"("userPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GameTier_gameId_tier_key" ON "GameTier"("gameId", "tier");

-- CreateIndex
CREATE INDEX "Puzzle_gameId_isActive_isBlocked_popularity_idx" ON "Puzzle"("gameId", "isActive", "isBlocked", "popularity");

-- CreateIndex
CREATE INDEX "Puzzle_gameId_difficultyTier_idx" ON "Puzzle"("gameId", "difficultyTier");

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_gameId_ingestSource_ingestRef_key" ON "Puzzle"("gameId", "ingestSource", "ingestRef");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleAsset_puzzleId_stage_key" ON "PuzzleAsset"("puzzleId", "stage");

-- CreateIndex
CREATE INDEX "Song_artist_idx" ON "Song"("artist");

-- CreateIndex
CREATE INDEX "Song_searchText_idx" ON "Song"("searchText");

-- CreateIndex
CREATE INDEX "DailyChallenge_gameId_dayKey_idx" ON "DailyChallenge"("gameId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallenge_gameId_tier_dayKey_key" ON "DailyChallenge"("gameId", "tier", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengePuzzle_dailyChallengeId_puzzleId_key" ON "DailyChallengePuzzle"("dailyChallengeId", "puzzleId");

-- CreateIndex
CREATE INDEX "Run_gameId_mode_tier_status_idx" ON "Run"("gameId", "mode", "tier", "status");

-- CreateIndex
CREATE INDEX "Run_playerId_startedAt_idx" ON "Run"("playerId", "startedAt");

-- CreateIndex
CREATE INDEX "Run_status_expiresAt_idx" ON "Run"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Run_gameId_tier_isRanked_score_idx" ON "Run"("gameId", "tier", "isRanked", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Run_playerId_gameId_tier_dayKey_key" ON "Run"("playerId", "gameId", "tier", "dayKey");

-- CreateIndex
CREATE INDEX "RunRound_puzzleId_outcome_idx" ON "RunRound"("puzzleId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "RunRound_runId_roundIndex_key" ON "RunRound"("runId", "roundIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RunRound_runId_puzzleId_key" ON "RunRound"("runId", "puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "Guess_idempotencyKey_key" ON "Guess"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Guess_roundId_attemptIndex_key" ON "Guess"("roundId", "attemptIndex");

-- CreateIndex
CREATE INDEX "HintUsage_runId_idx" ON "HintUsage"("runId");

-- CreateIndex
CREATE INDEX "LedgerEntry_playerId_createdAt_idx" ON "LedgerEntry"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerGameStat_gameId_tier_bestRunScore_idx" ON "PlayerGameStat"("gameId", "tier", "bestRunScore");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_playerId_gameId_tier_key" ON "PlayerGameStat"("playerId", "gameId", "tier");

-- CreateIndex
CREATE INDEX "PlayerPuzzleHistory_playerId_lastSeenAt_idx" ON "PlayerPuzzleHistory"("playerId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_gameId_boardType_tier_periodKey_score_idx" ON "LeaderboardEntry"("gameId", "boardType", "tier", "periodKey", "score");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_gameId_boardType_tier_periodKey_playerId_key" ON "LeaderboardEntry"("gameId", "boardType", "tier", "periodKey", "playerId");

-- AddForeignKey
ALTER TABLE "GuestClaim" ADD CONSTRAINT "GuestClaim_guestPlayerId_fkey" FOREIGN KEY ("guestPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestClaim" ADD CONSTRAINT "GuestClaim_userPlayerId_fkey" FOREIGN KEY ("userPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTier" ADD CONSTRAINT "GameTier_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Puzzle" ADD CONSTRAINT "Puzzle_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleAsset" ADD CONSTRAINT "PuzzleAsset_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengePuzzle" ADD CONSTRAINT "DailyChallengePuzzle_dailyChallengeId_fkey" FOREIGN KEY ("dailyChallengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengePuzzle" ADD CONSTRAINT "DailyChallengePuzzle_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_dailyChallengeId_fkey" FOREIGN KEY ("dailyChallengeId") REFERENCES "DailyChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunRound" ADD CONSTRAINT "RunRound_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunRound" ADD CONSTRAINT "RunRound_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guess" ADD CONSTRAINT "Guess_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RunRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintUsage" ADD CONSTRAINT "HintUsage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintUsage" ADD CONSTRAINT "HintUsage_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RunRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPuzzleHistory" ADD CONSTRAINT "PlayerPuzzleHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPuzzleHistory" ADD CONSTRAINT "PlayerPuzzleHistory_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

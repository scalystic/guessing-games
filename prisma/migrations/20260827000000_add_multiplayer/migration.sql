-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoomPlayerStatus" AS ENUM ('WAITING', 'READY', 'PLAYING', 'DISCONNECTED', 'LEFT');

-- AlterEnum
ALTER TYPE "RunMode" ADD VALUE 'MULTIPLAYER';

-- AlterTable
ALTER TABLE "PlayerGameStat" ADD COLUMN "multiplayerRunsPlayed" INTEGER NOT NULL DEFAULT 0,
                             ADD COLUMN "multiplayerWins" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN "multiplayerRoomId" TEXT;

-- CreateTable
CREATE TABLE "MultiplayerRoom" (
    "id" TEXT NOT NULL,
    "code" CHAR(6) NOT NULL,
    "gameId" TEXT NOT NULL,
    "hostPlayerId" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "maxPlayers" INTEGER NOT NULL DEFAULT 5,
    "totalRounds" INTEGER NOT NULL DEFAULT 5,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "seed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startsAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MultiplayerRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiplayerRoomPlayer" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "RoomPlayerStatus" NOT NULL DEFAULT 'WAITING',
    "seatIndex" INTEGER NOT NULL,
    "runId" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "roundsSolved" INTEGER NOT NULL DEFAULT 0,
    "totalRevealMs" INTEGER NOT NULL DEFAULT 0,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MultiplayerRoomPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiplayerRound" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "puzzleId" TEXT NOT NULL,

    CONSTRAINT "MultiplayerRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MultiplayerRoom_code_key" ON "MultiplayerRoom"("code");

-- CreateIndex
CREATE INDEX "MultiplayerRoom_status_expiresAt_idx" ON "MultiplayerRoom"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MultiplayerRoomPlayer_runId_key" ON "MultiplayerRoomPlayer"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "MultiplayerRoomPlayer_roomId_playerId_key" ON "MultiplayerRoomPlayer"("roomId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "MultiplayerRoomPlayer_roomId_seatIndex_key" ON "MultiplayerRoomPlayer"("roomId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MultiplayerRound_roomId_roundIndex_key" ON "MultiplayerRound"("roomId", "roundIndex");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_multiplayerRoomId_fkey" FOREIGN KEY ("multiplayerRoomId") REFERENCES "MultiplayerRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerRoom" ADD CONSTRAINT "MultiplayerRoom_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerRoom" ADD CONSTRAINT "MultiplayerRoom_hostPlayerId_fkey" FOREIGN KEY ("hostPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerRoomPlayer" ADD CONSTRAINT "MultiplayerRoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MultiplayerRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerRoomPlayer" ADD CONSTRAINT "MultiplayerRoomPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerRoomPlayer" ADD CONSTRAINT "MultiplayerRoomPlayer_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerRound" ADD CONSTRAINT "MultiplayerRound_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MultiplayerRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerRound" ADD CONSTRAINT "MultiplayerRound_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

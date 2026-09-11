-- Room-board tie-break: how many rounds this player solved off the first rung
-- of the reveal ladder (400ms today). Backfilled to 0 rather than recomputed
-- from RunRound: only rooms still in progress could be affected, and a finished
-- room's rankings are already emitted.
ALTER TABLE "MultiplayerRoomPlayer" ADD COLUMN "stageOneSolves" INTEGER NOT NULL DEFAULT 0;

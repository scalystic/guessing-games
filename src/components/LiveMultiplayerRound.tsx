"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomChat, type ChatMessage } from "@/components/RoomChat";
import { GuessAutocomplete } from "@/components/GuessAutocomplete";
import { AttemptTimeline } from "@/components/AttemptTimeline";
import { CoverArt } from "@/components/CoverArt";
import { PlayerBar } from "@/components/PlayerBar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { toPlayerView } from "@/lib/multiplayer/player-view";
import { previewPoints } from "@/lib/game/scoring/preview";
import { newIdempotencyKey, type CatalogMatch, type RoundHint } from "@/lib/api/runs";
import type { GuessRecord, PendingAction } from "@/hooks/useMelodleGame";
import type { UseMultiplayerRoomResult } from "@/hooks/useMultiplayerRoom";
import type { CurrentUser } from "@/lib/get-current-user";

type Props = {
  mp: UseMultiplayerRoomResult;
  roomCode: string;
  gameSlug: string;
  tagline: string | null;
  revealLadder: number[];
  maxAttempts: number;
  user: CurrentUser;
  onLeave: () => void;
};

type AttemptOutcome = {
  outcome: "PENDING" | "SOLVED" | "FAILED";
  stageReached: number;
  points: number | null;
  currentStreak: number;
  hint: RoundHint | null;
};

async function callRun(
  path: "guess" | "skip",
  runId: string,
  runToken: string,
  body: Record<string, unknown>,
): Promise<AttemptOutcome | null> {
  try {
    const res = await fetch(`/api/runs/${runId}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

// The live round for a real multiplayer room — everyone hears the same
// server-selected clip (MultiplayerRound), and every guess/skip spends a real
// attempt against the player's own Run via the same endpoints solo play uses.
// Nothing here is simulated: round:progress / round:results / game:end all
// come from the socket, driven by every player's real attempts landing
// server-side (see resolveRound in socket-handler.ts).
export function LiveMultiplayerRound({ mp, roomCode, gameSlug, tagline, revealLadder, maxAttempts, user, onLeave }: Props) {
  const { phase, room, players, myPlayerId, myRun, roundResults, roundDeadline, finalRankings, roundProgress, chatMessages, sendChat, notifyRoundDone, rematch } = mp;

  const views = players.map((p) => toPlayerView(p, myPlayerId));
  const sortedLeaderboard = [...views].sort((a, b) => b.score - a.score);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [stageReached, setStageReached] = useState(1);
  const [guesses, setGuesses] = useState<GuessRecord[]>([]);
  const [guessedPuzzleIds, setGuessedPuzzleIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [roundDone, setRoundDone] = useState(false);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [hint, setHint] = useState<RoundHint | null>(null);
  const [nextRoundSecondsLeft, setNextRoundSecondsLeft] = useState(0);

  const objectUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const roundIndexRef = useRef(room?.currentRound ?? 1);

  function releaseAudio() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }
  useEffect(() => releaseAudio, []);

  const loadAudio = useCallback(async (runId: string, runToken: string, generation: number) => {
    setAudioLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/audio`, { headers: { Authorization: `Bearer ${runToken}` } });
      if (!res.ok || generation !== generationRef.current) return;
      const blob = await res.blob();
      if (generation !== generationRef.current) return;
      const stageHeader = res.headers.get("x-reveal-stage");
      if (stageHeader) setStageReached(Number(stageHeader));
      releaseAudio();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setAudioUrl(url);
    } catch {
      // Leave the previous clip on screen; the Skip/Guess controls stay live.
    } finally {
      if (generation === generationRef.current) setAudioLoading(false);
    }
  }, []);

  // Fresh round: reset local state and pull stage 1 the moment credentials +
  // a room advance land together. Keyed on room.currentRound rather than
  // myRun.runId — a reconnect hands out the same runId again but the round
  // may have moved on underneath it.
  useEffect(() => {
    if (phase !== "playing" || !myRun || !room) return;
    if (roundIndexRef.current === room.currentRound && audioUrl) return;
    roundIndexRef.current = room.currentRound;
    const generation = ++generationRef.current;
    setRoundDone(false);
    setGuessedPuzzleIds(new Set());
    setGuesses([]);
    setStageReached(1);
    setLastPoints(null);
    setHint(null);
    void loadAudio(myRun.runId, myRun.runToken, generation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, room?.currentRound, myRun?.runId]);

  async function applyResult(res: AttemptOutcome | null, roundIndex: number) {
    if (!res) return;
    setStageReached(res.stageReached);
    setCurrentStreak(res.currentStreak);
    if (res.outcome === "SOLVED" || res.outcome === "FAILED") {
      setRoundDone(true);
      setLastPoints(res.points);
      setHint(null);
      notifyRoundDone(roundIndex, res.outcome);
    } else {
      setHint(res.hint);
      if (myRun) {
        const generation = ++generationRef.current;
        void loadAudio(myRun.runId, myRun.runToken, generation);
      }
    }
  }

  // Live countdown to the next round, driven by the server's own
  // nextRoundAt timestamp rather than a guessed client-side delay — the
  // server is the one actually scheduling round:start, so it's the only
  // thing that can say exactly when that fires.
  useEffect(() => {
    if (phase !== "round_results" || !roundResults) return;

    const target = new Date(roundResults.nextRoundAt).getTime();
    const tick = () => {
      setNextRoundSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [phase, roundResults]);

  const handleGuess = useCallback(
    async (match: CatalogMatch) => {
      if (!myRun || roundDone || pendingAction || !room) return;
      setPendingAction("guess");
      setGuessedPuzzleIds((prev) => new Set(prev).add(match.puzzleId));
      const roundIndex = room.currentRound;
      const res = await callRun("guess", myRun.runId, myRun.runToken, {
        guessedPuzzleId: match.puzzleId,
        rawInput: `${match.title} — ${match.artist}`,
        idempotencyKey: newIdempotencyKey(),
      });
      setGuesses((prev) => [
        ...prev,
        { song: { title: match.title, artist: match.artist }, puzzleId: match.puzzleId, correct: res?.outcome === "SOLVED", skipped: false, at: Date.now() },
      ]);
      await applyResult(res, roundIndex);
      setPendingAction(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myRun, roundDone, pendingAction, room],
  );

  const handleSkip = useCallback(async () => {
    if (!myRun || roundDone || pendingAction || !room) return;
    setPendingAction("skip");
    const roundIndex = room.currentRound;
    const res = await callRun("skip", myRun.runId, myRun.runToken, { idempotencyKey: newIdempotencyKey() });
    setGuesses((prev) => [...prev, { song: null, puzzleId: null, correct: false, skipped: true, at: Date.now() }]);
    await applyResult(res, roundIndex);
    setPendingAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRun, roundDone, pendingAction, room]);

  // Display-only countdown to the round's real, server-enforced 60s budget
  // (ROUND_TIMEOUT_MS in socket-handler.ts) — nothing here forces a skip.
  // Guessing wrong or clicking Skip is the only way to move a stage forward
  // now; if the clock reaches 0 with the round still open, the server itself
  // force-resolves it (forceResolveStragglers), which arrives on this client
  // as the normal round:results broadcast.
  const [roundSecondsLeft, setRoundSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!roundDeadline || roundDone) return;
    const target = new Date(roundDeadline).getTime();
    const tick = () => {
      setRoundSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [roundDeadline, roundDone]);

  // Exact, not estimated: the real formula (scoring/v1.ts) keys off stage
  // reached, round depth and streak — never a clock — so this is what
  // scoreSolvedRound would actually return if you solved on this exact
  // attempt, mirrored client-side for display only.
  const potentialPoints = previewPoints(stageReached, room?.currentRound ?? 1, currentStreak);
  const revealMs = revealLadder[stageReached - 1] ?? revealLadder[0] ?? 0;
  const totalMs = revealLadder[revealLadder.length - 1] ?? 0;

  // The "guessed correctly" / "ran out of attempts" announcements are already
  // in here — the server broadcasts them as real room:chat system messages
  // (see round:done in socket-handler.ts), not synthesized client-side, so
  // every player sees the identical line without any local diffing/dedup
  // logic to get wrong.
  const chatViewMessages: ChatMessage[] = chatMessages.map((m) => {
    if (m.kind === "system") {
      return { id: m.id, kind: "system" as const, text: m.text };
    }
    return {
      id: m.id,
      kind: "msg" as const,
      player: toPlayerView(
        { playerId: m.playerId || "", displayName: m.displayName || "Unknown", avatarUrl: null, status: "PLAYING", seatIndex: 0, score: 0, roundsSolved: 0, isHost: false, isWinner: false },
        myPlayerId,
      ),
      text: m.text,
    };
  });

  if (phase === "game_end") {
    return (
      <RoundShell roomCode={roomCode} title="Game over" onLeave={onLeave}>
        <div className="flex flex-col gap-2">
          {finalRankings.map((r) => (
            <div
              key={r.playerId}
              className={`flex items-center gap-4 rounded-[10px] px-4 py-3 ${
                r.isWinner ? "border border-(--signal)/45 bg-(--signal)/14" : "border border-(--hairline) bg-(--surface)"
              }`}
            >
              <span className="w-7 text-center font-mono text-sm font-bold text-(--text-faint)">{r.rank}</span>
              <span className="flex-1 text-sm font-semibold text-(--text)">
                {r.playerId === myPlayerId ? "You" : r.displayName}
                {r.isWinner ? " 🏆" : ""}
              </span>
              <span className="font-mono text-xs text-(--text-dim)">{r.score.toLocaleString()} pts · {r.roundsSolved} solved</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={rematch}
          className="mt-5 h-11 w-full rounded-[7px] bg-(--signal) text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
        >
          Done
        </button>
      </RoundShell>
    );
  }



  // phase === 'playing'
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto no-scrollbar bg-(--bg) text-(--text)">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 pb-12 pt-5 sm:px-6 sm:pb-16 sm:pt-8">
        <header className="flex flex-col gap-3.5 border-b border-(--hairline) pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-1.5 bg-(--signal)" aria-hidden="true" />
              <p className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-none tracking-[0.04em] text-(--text)">SARGAM</p>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 rounded-full border border-(--hairline) bg-(--surface-strong) px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.06em] text-(--text)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--success)" aria-hidden="true" />
                Room {roomCode}
              </span>
              <ProfileMenu
                user={user}
                trigger={({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{ background: "var(--signal)", color: "var(--signal-ink)" }}
                    title="You"
                    aria-label="Account menu"
                  >
                    {views.find((p) => p.isYou)?.initial ?? "Y"}
                  </button>
                )}
              />
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(true)}
                className="flex h-10 items-center gap-2 rounded-full border border-(--miss)/45 bg-(--surface) px-3 text-sm font-semibold text-(--miss) transition-colors duration-200 hover:bg-(--miss)/12"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M13 4H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7M9 10h8m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Leave room</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm">
              <span className="font-semibold text-(--text)">
                Round {room?.currentRound ?? 1} of {room?.totalRounds ?? "?"}
              </span>
              {tagline && <span className="text-(--text-faint)"> · {tagline}</span>}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex -space-x-1.5">
                {views.slice(0, 6).map((p) => (
                  <span
                    key={p.id}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-(--bg) text-[9px] font-bold text-white"
                    style={{ background: p.isYou ? "var(--signal)" : p.color, color: p.isYou ? "var(--signal-ink)" : "#fff" }}
                    title={p.isYou ? "You" : p.name}
                  >
                    {p.initial}
                  </span>
                ))}
              </div>
              <span className="font-mono text-[11px] text-(--text-faint)">
                {views.length} / {room?.maxPlayers ?? "?"} joined
              </span>
            </div>
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-4 min-[980px]:grid min-[980px]:grid-cols-[1fr_372px] min-[980px]:items-start min-[980px]:gap-5">
          <div className="flex flex-col gap-4.5 rounded-[14px] border border-(--hairline) bg-(--surface) p-4.5 sm:p-5.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold">Now guessing</h2>
              <span className="rounded-full border border-(--hairline) px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-(--text-faint)">
                Track {room?.currentRound ?? 1} / {room?.totalRounds ?? "?"}
              </span>
            </div>

            {!roundDone && (
              <div className="flex flex-wrap items-center gap-5">
                <PointsRing potentialPoints={potentialPoints} stageReached={stageReached} maxAttempts={maxAttempts} />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-nowrap text-xs text-(--text-dim)">
                    <b className="text-(--text)">Fewer attempts score higher.</b> Skips and misses trim the points.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["1000 pts at stage 1", "100 pts at stage 6", "+streak bonus"].map((t) => (
                      <span key={t} className="rounded-md border border-(--hairline) bg-(--surface-hover) px-1.5 py-0.5 font-mono text-[10px] text-(--text-faint)">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                {roundSecondsLeft !== null && <RoundTimerBadge secondsLeft={roundSecondsLeft} />}
              </div>
            )}

            <div className="flex flex-col gap-2.5 border-t border-(--hairline) pt-4">
              <PlayerBar
                audioUrl={audioUrl}
                revealMs={revealMs}
                totalMs={totalMs}
                ladder={revealLadder}
                loading={audioLoading}
                waveformSeed={`${myRun?.runId ?? "run"}:${room?.currentRound ?? 1}`}
                promptSubtitle="Everyone in the room hears the same clip."
              />
              {lastPoints !== null && (
                <span className="self-start rounded-[4px] border border-(--success)/40 bg-(--success)/12 px-2.5 py-1.5 font-mono text-[11px] font-bold text-(--success)">
                  +{lastPoints} pts
                </span>
              )}
            </div>

            <AttemptTimeline guesses={guesses} currentAttempt={guesses.length + 1} maxAttempts={maxAttempts} />

            {!roundDone && <HintLadder hint={hint} />}

            {roundDone ? (
              <div className="rounded-[9px] border border-dashed border-(--hairline) bg-(--surface-strong) p-3 text-center text-xs text-(--text-faint)">
                Waiting for other players to finish…
              </div>
            ) : (
              <GuessAutocomplete
                gameSlug={gameSlug}
                disabled={audioLoading || !myRun || roundDone}
                pendingAction={pendingAction}
                nextRevealMs={revealLadder[stageReached] ?? null}
                excludePuzzleIds={guessedPuzzleIds}
                onGuess={handleGuess}
                onSkip={handleSkip}
              />
            )}

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">
                Players — {views.length} in room
              </span>
              <div className="flex gap-3.5 overflow-x-auto pb-1 pt-1.5">
                {views.map((p) => {
                  const prog = roundProgress.get(p.id);
                  const isDone = prog?.done ?? false;
                  return (
                    <div key={p.id} className="relative flex w-[58px] shrink-0 flex-col items-center gap-1.5">
                      <div className="relative">
                        {!isDone && (
                          <span
                            className="absolute -inset-1 rounded-full border-2"
                            style={{ borderColor: p.isYou ? "var(--signal)" : p.color }}
                          />
                        )}
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold"
                          style={{
                            border: `2.5px solid ${p.isYou ? "var(--signal)" : p.color}`,
                            background: p.isYou ? "var(--signal)" : "var(--surface-strong)",
                            color: p.isYou ? "var(--signal-ink)" : "var(--text)",
                          }}
                        >
                          {p.initial}
                        </span>
                        {isDone && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 flex h-[17px] w-[17px] items-center justify-center rounded-full border-2 border-(--surface) text-[10px] text-white ${
                              prog?.outcome === "SOLVED" ? "bg-(--success)" : "bg-(--miss)"
                            }`}
                          >
                            {prog?.outcome === "SOLVED" ? "✓" : "✕"}
                          </span>
                        )}
                      </div>
                      <span className={`max-w-[58px] truncate text-center text-[10.5px] ${p.isYou ? "font-bold text-(--text)" : "text-(--text-dim)"}`}>
                        {p.isYou ? "You" : p.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-[14px] border border-(--hairline) bg-(--surface)">
              <div className="flex items-center justify-between px-4 pt-3.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">🏆 Leaderboard</span>
                <span className="font-mono text-[11px] text-(--text-faint)">Round {room?.currentRound ?? 1}/{room?.totalRounds ?? "?"}</span>
              </div>
              <div className="flex flex-col px-2 pb-3 pt-2.5">
                {sortedLeaderboard.map((p, i) => {
                  const rank = i + 1;
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank);
                  return (
                    <div
                      key={p.id}
                      className={`grid grid-cols-[26px_30px_1fr_auto] items-center gap-2.5 rounded-[10px] px-2 py-2 ${
                        p.isYou ? "border border-(--signal)/45 bg-(--signal)/14" : ""
                      }`}
                    >
                      <span className={`text-center font-mono font-bold text-(--text-faint) ${rank <= 3 ? "text-base" : "text-xs"}`}>{medal}</span>
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: p.isYou ? "var(--signal)" : p.color, color: p.isYou ? "var(--signal-ink)" : "#fff" }}
                      >
                        {p.initial}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                        {p.isYou ? "You" : p.name}
                        {p.isYou && <span className="rounded bg-(--signal) px-1.5 py-0.5 font-mono text-[9px] font-bold text-(--signal-ink)">YOU</span>}
                      </span>
                      <span className="font-mono text-[13.5px] font-bold tabular-nums">{p.score.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <RoomChat title="Room chat" onlineCount={views.length} messages={chatViewMessages} onSend={sendChat} />
          </div>
        </div>
      </div>

      {/* Round Results Popup Modal */}
      {phase === "round_results" && roundResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--scrim) p-4 backdrop-blur-[2px] animate-[pop-in_0.35s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="w-full max-w-md rounded-[14px] border border-(--hairline) bg-(--surface-strong) p-6 shadow-2xl">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">
              Round {roundResults.roundIndex} results
            </span>

            {/* Only reachable once the round has resolved and the reveal is
               already shown to everyone — real album art here leaks nothing
               that isn't already on screen as plain text. */}
            <div className="mt-3 flex items-center gap-3.5">
              <CoverArt
                title={roundResults.puzzle.title}
                artist={roundResults.puzzle.artist}
                album={roundResults.puzzle.album}
                className="h-16 w-16 shrink-0 rounded-[10px] shadow-lg"
              />
              <div className="min-w-0">
                <h2 className="truncate font-[family-name:var(--font-display)] text-xl font-bold text-(--text)">{roundResults.puzzle.title}</h2>
                <p className="truncate text-xs text-(--text-faint)">
                  {roundResults.puzzle.artist}
                  {roundResults.puzzle.album ? ` · ${roundResults.puzzle.album}` : ""}
                  {roundResults.puzzle.releaseYear ? ` · ${roundResults.puzzle.releaseYear}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {[...roundResults.playerResults]
                .sort((a, b) => b.points - a.points)
                .map((pr, i) => (
                  <div
                    key={pr.playerId}
                    className={`flex items-center gap-3 rounded-[10px] border px-4 py-2.5 ${
                      pr.playerId === myPlayerId ? "border-(--signal)/45 bg-(--signal)/10" : "border-(--hairline) bg-(--surface)"
                    }`}
                  >
                    <span className="w-4 shrink-0 text-center font-mono text-[11px] font-bold text-(--text-faint)">
                      {pr.outcome === "SOLVED" && i === 0 ? "🥇" : i + 1}
                    </span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${pr.outcome === "SOLVED" ? "bg-(--success)" : "bg-(--miss)"}`} />
                    <span className="flex-1 truncate text-sm font-semibold text-(--text)">{pr.playerId === myPlayerId ? "You" : pr.displayName}</span>
                    <span className="font-mono text-xs text-(--text-dim)">{pr.attemptsUsed}/{maxAttempts} attempts</span>
                    <span className="font-mono text-sm font-bold text-(--text)">{pr.outcome === "SOLVED" ? `+${pr.points}` : "—"}</span>
                  </div>
                ))}
            </div>

            <div className="mt-5 flex flex-col items-center border-t border-(--hairline) pt-4">
              <p className="flex items-center gap-2 text-center text-xs text-(--text-faint)">
                <span className="h-2 w-2 rounded-full bg-(--signal) animate-ping" />
                {roundResults.roundIndex >= (room?.totalRounds ?? roundResults.roundIndex)
                  ? `Final results in ${nextRoundSecondsLeft}s…`
                  : `Next round in ${nextRoundSecondsLeft}s…`}
              </p>
            </div>
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-[14px] border border-(--hairline) bg-(--surface-strong) p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-(--text)">
              Leave the room?
            </h2>
            <p className="mt-2 text-sm text-(--text-dim)">
              The game is in progress. Leaving now will remove you from the round.
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="h-10 flex-1 rounded-[7px] border border-(--hairline) text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover)"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={onLeave}
                className="h-10 flex-1 rounded-[7px] bg-(--miss) text-sm font-bold text-white transition-colors duration-200 hover:opacity-90"
              >
                Leave room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 58;

// Depletes with real stage progress, not a clock — this game's scoring never
// decays by the second (see previewPoints). Every skip or wrong guess moves
// stageReached forward by exactly one rung, so the ring drains in the same
// discrete steps the score actually does, never smoothly ticking down on its
// own between attempts.
function PointsRing({
  potentialPoints,
  stageReached,
  maxAttempts,
}: {
  potentialPoints: number | null;
  stageReached: number;
  maxAttempts: number;
}) {
  const frac = Math.min(1, Math.max(0, (stageReached - 1) / Math.max(1, maxAttempts - 1)));
  const stroke = frac < 0.45 ? "var(--signal)" : frac < 0.78 ? "#e08a3c" : "var(--miss)";

  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r="58" fill="none" stroke="var(--hairline)" strokeWidth="6" />
        <circle
          cx="66"
          cy="66"
          r="58"
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * frac}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-[26px] font-bold tabular-nums text-(--text)">{potentialPoints ?? "—"}</span>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-(--text-faint)">
          Potential pts
        </span>
      </div>
    </div>
  );
}

// Deliberately NOT another ring — a digital stopwatch readout instead, so it
// doesn't compete visually with PointsRing for the same "circular gauge"
// read. Depletes on the real clock, switching to the miss color in the
// closing 10 seconds as an urgency cue.
function RoundTimerBadge({ secondsLeft }: { secondsLeft: number }) {
  const urgent = secondsLeft <= 10;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div
      className={`flex shrink-0 items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 transition-colors duration-300 ${
        urgent ? "border-(--miss)/50 bg-(--miss)/10" : "border-(--hairline) bg-[#10131e]"
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        className={urgent ? "text-(--miss) animate-pulse" : "text-(--text-faint)"}
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className={`font-mono text-[22px] font-black tabular-nums ${urgent ? "text-(--miss)" : "text-(--signal)"}`}>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
        <span className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-(--text-faint)">
          Round time
        </span>
      </div>
    </div>
  );
}

// Three real hint tiers (decade, genre, first letter), driven entirely by the
// server's own RoundHint (see deriveHint in lib/game/hint.ts) — a field is
// null until the server has actually decided you've earned it, so "locked"
// here just means "not in the object yet," never a client-side guess at when
// it unlocks.
function HintLadder({ hint }: { hint: RoundHint | null }) {
  const rows: { key: string; label: string; value: string | null }[] = [
    { key: "decade", label: "Decade", value: hint?.decade ?? null },
    { key: "genre", label: "Genre", value: hint?.genre ?? null },
    { key: "firstLetter", label: "First letter", value: hint?.firstLetter ? `Starts with "${hint.firstLetter}"` : null },
  ];

  return (
    <section aria-labelledby="hints-label">
      <p id="hints-label" className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">
        Hints
      </p>
      <ol className="flex flex-col gap-1.5">
        {rows.map((row, i) => {
          const unlocked = row.value !== null;
          return (
            <li
              key={row.key}
              className={`flex items-center gap-2.5 rounded-[7px] border px-3 py-2 text-xs transition-colors duration-200 ${
                unlocked ? "border-(--signal)/35 bg-(--signal)/8 text-(--text)" : "border-(--hairline) bg-(--surface-strong) text-(--text-faint)"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current font-mono text-[10px] font-bold">
                {unlocked ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {unlocked ? row.value : `${row.label} — locked`}
              </span>
              {!unlocked && (
                <span aria-hidden="true" className="shrink-0 text-[11px]">
                  🔒
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RoundShell({ roomCode, title, onLeave, children }: { roomCode: string; title: string; onLeave: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto no-scrollbar bg-(--bg) text-(--text)">
      <div className="mx-auto flex w-full max-w-[640px] flex-col px-4 pb-12 pt-8 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-faint)">Room {roomCode}</p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-(--text)">{title}</h1>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="shrink-0 rounded-full border border-(--hairline) px-3 py-1.5 text-xs font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover)"
          >
            Leave
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

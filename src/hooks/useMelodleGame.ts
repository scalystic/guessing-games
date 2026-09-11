"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  fetchRevealAudio,
  fetchRunState,
  fetchStageAudio,
  giveUpRound,
  inlineStageAudio,
  newIdempotencyKey,
  skipRound,
  startRun,
  submitGuess,
  type AttemptResult,
  type CatalogMatch,
  type InlineAudio,
  type DecadeFilter,
  type Reveal,
  type RoundHint,
  type RunState,
  type RunStatus,
} from "@/lib/api/runs";

export type { DecadeFilter };
import { clearStoredRun, loadStoredRun, saveStoredRun } from "@/lib/run-storage";

/// The run loop, driven entirely by the server.
///
/// Everything that used to be computed here — the target song, the stage, the
/// score, whether a guess was right — now arrives from POST /api/runs and the
/// attempt responses. The client's job is to render what it is told and to hold
/// exactly two things the server can't: what the player typed at each attempt
/// (the API echoes an outcome, not a label), and the object URL for the audio
/// bytes it has already been handed.
///
/// One asymmetry worth knowing when reading this: resolving a round ALSO opens
/// the next one server-side, in the same transaction. So by the time the result
/// panel appears, `Run.currentRoundIndex` has already moved on and
/// `nextAudioUrl` points at the new round's stage 1. `nextRound()` therefore
/// makes no request beyond fetching that audio.

export type RoundStatus = "PENDING" | "SOLVED" | "FAILED";

export type GuessRecord = {
  /// What the player named. Null for a skip.
  song: { title: string; artist: string } | null;
  /// The puzzle they named, so the typeahead can stop offering it. Null for a
  /// skip. Survives a resume — GET /api/runs/[runId] returns the id behind each
  /// wrong guess on the open round, because nothing server-side refuses a
  /// repeat and a re-offered miss would quietly spend an attempt.
  puzzleId: string | null;
  correct: boolean;
  skipped: boolean;
  at: number;
  /// Submitted, verdict not back yet. The slot is claimed optimistically so the
  /// board reacts on the keystroke rather than on the round trip, but the outcome
  /// stays unknown until the server rules — rendering it as a miss and then
  /// flipping it to correct would be a lie the player watches happen.
  pending?: boolean;
};

export type RoundHistoryEntry = {
  song: {
    title: string;
    artist: string;
    album: string | null;
    movie: string | null;
    releaseYear: number | null;
  };
  solved: boolean;
  attemptsUsed: number;
  at: number;
};

/// A wrong guess on a round that is still open.
///
/// The attempts row flipping a slot to MISS is the only thing that used to mark
/// one, which is easy to look straight past — especially since the typeahead
/// clears itself at the same moment, so the screen's most visible change is the
/// answer disappearing. This is what the UI announces instead.
export type MissFeedback = {
  /// Monotonic, so two identical misses in a row still retrigger the animation
  /// rather than being deduplicated into one by React.
  id: number;
  /// What the player named. Never null — a skip is not a miss.
  guessed: { title: string; artist: string };
  attemptsRemaining: number;
  /// The clip window the miss just opened up, in ms. Null when the ladder had
  /// nothing further to unlock.
  unlockedMs: number | null;
};

export type GameConfig = {
  gameSlug: string;
  revealLadder: number[];
  maxAttempts: number;
  mode?: "PRACTICE" | "DAILY";
};

/// `selecting` is the pre-game era picker — shown whenever there's no run to
/// resume, before any request has gone out. `starting` covers both a fresh
/// run (after a pick) and a resume — the board can't be drawn either way.
/// `error` is terminal until the player retries.
export type GamePhase = "selecting" | "starting" | "ready" | "error";
export type PendingAction = "guess" | "skip" | "giveup" | null;

export function useMelodleGame({ gameSlug, revealLadder, maxAttempts, mode = "PRACTICE" }: GameConfig) {
  const [phase, setPhase] = useState<GamePhase>("starting");
  const [error, setError] = useState<string | null>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("IN_PROGRESS");
  /// Era category the active (or about to start) run samples from. Kept in
  /// sync with the server's Run.decadeFilter rather than trusted locally,
  /// since a resumed run's filter is decided server-side.
  const [era, setEraState] = useState<DecadeFilter | null>(null);

  // Current round.
  const [roundIndex, setRoundIndex] = useState(1);
  const [stage, setStage] = useState(1);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [guesses, setGuesses] = useState<GuessRecord[]>([]);
  const [status, setStatus] = useState<RoundStatus>("PENDING");
  const [hint, setHint] = useState<RoundHint | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [miss, setMiss] = useState<MissFeedback | null>(null);
  const missIdRef = useRef(0);

  // Run totals — all server-owned.
  const [lives, setLives] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [roundsSolved, setRoundsSolved] = useState(0);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);

  // Level, rank and achievements used to be held here too, recomputed from the
  // current run on every attempt — which is why they reset at the top of every
  // set. They are lifetime state now: usePlayerStats reads them from
  // GET /api/players/stats.

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  /// Bumped when the player has earned a clip they asked for outright — i.e. a
  /// skip — so the deck can start it instead of waiting for a second click. See
  /// PlayerBar's autoPlayToken.
  const [autoPlayToken, setAutoPlayToken] = useState(0);

  // YouTube streaming state for the current round.
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [hookStartMs, setHookStartMs] = useState(0);
  /// Next round's YouTube info, saved when a round resolves (same as nextRoundAudioRef).
  const nextRoundYoutubeRef = useRef<{ videoId: string | null; hookStartMs: number } | null>(null);

  /// The whole clip for the round that just resolved — what the result panel
  /// plays back. Kept apart from `audioUrl`, which still holds only the prefix
  /// this round actually earned: a stage-1 solve unlocked ~200ms, which is not
  /// something worth offering a play button for.
  const [revealAudioUrl, setRevealAudioUrl] = useState<string | null>(null);
  const [revealAudioLoading, setRevealAudioLoading] = useState(false);

  // The token never enters React state: it is not rendered, and keeping it in a
  // ref means a stale closure can't hand an old run's token to a new run.
  const tokenRef = useRef<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const revealObjectUrlRef = useRef<string | null>(null);
  /// Bumped on every run start and round change. An audio fetch that resolves
  /// after its generation is stale gets discarded instead of playing the
  /// previous round's clip over the current one.
  const generationRef = useRef(0);
  /// Stage 1 of the round the server opened when the last one resolved, handed
  /// over with that attempt's response. `nextRound()` plays it without asking for
  /// anything, which is why advancing a round is now instant.
  const nextRoundAudioRef = useRef<InlineAudio | null>(null);
  /// Guards the mount effect against a second invocation.
  ///
  /// POST /api/runs is not idempotent — it creates a row. React's development
  /// StrictMode mounts, unmounts and remounts every component, so without this
  /// each page load starts TWO runs and abandons one. The generation counter
  /// keeps state coherent when that happens, but it can't un-create the run.
  const initializedRef = useRef(false);

  const releaseAudio = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const releaseRevealAudio = useCallback(() => {
    if (revealObjectUrlRef.current) {
      URL.revokeObjectURL(revealObjectUrlRef.current);
      revealObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => releaseAudio, [releaseAudio]);
  useEffect(() => releaseRevealAudio, [releaseRevealAudio]);

  /// Swap in audio the server already handed us.
  ///
  /// The fast path: an attempt response carries the bytes for the stage it just
  /// unlocked, so there is nothing to fetch and nothing to wait for.
  const playInlineAudio = useCallback(
    (inline: InlineAudio, generation: number) => {
      if (generation !== generationRef.current) return;

      const audio = inlineStageAudio(inline);
      releaseAudio();
      objectUrlRef.current = audio.objectUrl;
      setAudioUrl(audio.objectUrl);
      setStage(audio.stage);
      setAudioLoading(false);
    },
    [releaseAudio],
  );

  /// Pull the audio the current round has earned and swap it in.
  ///
  /// The fallback path, for a resume and for the rare response that declined to
  /// inline its audio.
  ///
  /// YOUTUBE-ONLY — DORMANT. Every call site is guarded by `!youtubeVideoId`, and
  /// the server now only ever samples puzzles that have a video id, so this and
  /// `loadRevealAudio` below are unreachable in practice; the route they call
  /// (GET /api/runs/[runId]/audio) returns 410.
  ///
  /// They are kept, rather than deleted, because deleting them cascades: the
  /// `audioUrl` / `revealAudioUrl` / `audioLoading` / `revealAudioLoading` values
  /// this hook returns feed PlayerBar's `<audio>` branch and the result panel, and
  /// tearing those out is a UI change, not a source-of-audio change. They stay
  /// wired but cold, so restoring stored clips is a server-side revert.
  const loadAudio = useCallback(
    async (id: string, generation: number) => {
      const token = tokenRef.current;
      if (!token) return;

      setAudioLoading(true);
      try {
        const audio = await fetchStageAudio(id, token);
        if (generation !== generationRef.current) {
          // Superseded while in flight. Revoke immediately or it leaks.
          URL.revokeObjectURL(audio.objectUrl);
          return;
        }
        releaseAudio();
        objectUrlRef.current = audio.objectUrl;
        setAudioUrl(audio.objectUrl);
        // The server's stage is authoritative — trust the header over local
        // bookkeeping if they ever disagree.
        setStage(audio.stage);
      } catch (cause) {
        if (generation !== generationRef.current) return;
        setAudioUrl(null);
        setError(messageFor(cause, "Couldn't load the clip for this round."));
      } finally {
        if (generation === generationRef.current) setAudioLoading(false);
      }
    },
    [releaseAudio],
  );

  /// Pull the full clip for the round that just resolved.
  ///
  /// Best-effort on purpose: a failure here costs the player a play button on a
  /// round they already finished, so it must not raise the run-level error that
  /// a failed stage fetch does.
  const loadRevealAudio = useCallback(
    async (id: string, generation: number) => {
      const token = tokenRef.current;
      if (!token) return;

      setRevealAudioLoading(true);
      try {
        const audio = await fetchRevealAudio(id, token);
        if (generation !== generationRef.current) {
          URL.revokeObjectURL(audio.objectUrl);
          return;
        }
        releaseRevealAudio();
        revealObjectUrlRef.current = audio.objectUrl;
        setRevealAudioUrl(audio.objectUrl);
        // Deliberately not touching `stage`: the reveal always reports the last
        // stage, which would misdraw the ladder the panel sits on top of.
      } catch {
        if (generation !== generationRef.current) return;
        setRevealAudioUrl(null);
      } finally {
        if (generation === generationRef.current) setRevealAudioLoading(false);
      }
    },
    [releaseRevealAudio],
  );

  const resetRoundView = useCallback(() => {
    setGuesses([]);
    setStatus("PENDING");
    setHint(null);
    setReveal(null);
    setLastPoints(null);
    setMiss(null);
    setAttemptsUsed(0);
    setStage(1);
    releaseRevealAudio();
    setRevealAudioUrl(null);
    setRevealAudioLoading(false);
  }, [releaseRevealAudio]);

  /// Start a brand-new run, replacing anything stored.
  ///
  /// `eraOverride` distinguishes "no explicit choice, keep whatever `era`
  /// already is" (undefined — the mount/resume/retry paths) from "the player
  /// picked a new one" (a `DecadeFilter | null` value, including `null` for
  /// "All").
  const begin = useCallback(async (eraOverride?: DecadeFilter | null) => {
    const generation = ++generationRef.current;
    const nextEra = eraOverride !== undefined ? eraOverride : era;

    setPhase("starting");
    setError(null);
    releaseAudio();
    setAudioUrl(null);
    resetRoundView();
    // Belongs to the run being replaced.
    nextRoundAudioRef.current = null;
    // roundHistory is deliberately NOT cleared. Everything else here is a Run
    // column and has to go back to what the new run says, but the played-songs
    // list is a record of this visit — a run ending (catalog exhausted, or the
    // player hitting "Play Now") is not a reason for songs they just heard to
    // vanish off the bottom of the screen. A resume replaces it wholesale from
    // the server, so it can't drift into a duplicate of the run's own rounds.
    setRoundsPlayed(0);
    setRoundsSolved(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);

    try {
      const started = await startRun(gameSlug, mode, mode === "DAILY" ? null : nextEra);
      if (generation !== generationRef.current) return;

      tokenRef.current = started.runToken;
      saveStoredRun({
        runId: started.runId,
        runToken: started.runToken,
        gameSlug,
        mode,
      });

      setRunId(started.runId);
      setRunStatus("IN_PROGRESS");
      setEraState(started.decadeFilter);
      setRoundIndex(started.roundIndex);
      setStage(started.stageReached);
      setLives(started.livesRemaining);
      setYoutubeVideoId(started.youtubeVideoId);
      setHookStartMs(started.hookStartMs);
      setPhase("ready");

      // YouTube songs stream directly — no audio bytes to fetch.
      if (started.nextAudio) playInlineAudio(started.nextAudio, generation);
      else if (!started.youtubeVideoId) await loadAudio(started.runId, generation);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setPhase("error");
      setError(
        messageFor(
          cause,
          "Couldn't start a run. The catalog may be empty — ingest some songs first.",
        ),
      );
    }
  }, [gameSlug, mode, era, loadAudio, playInlineAudio, releaseAudio, resetRoundView]);

  /// Rebuild the board from the run the last visit left behind.
  ///
  /// This is what stops a refresh from zeroing the stats panel. The run itself
  /// survives a reload — it is a row with a 180-minute TTL, and its token is in
  /// localStorage — so score, streak, best streak and the solved counts were
  /// never actually lost. They were simply never asked for: POST /api/runs
  /// opened a SECOND run on every load and the client drew that one's totals,
  /// which are zero by definition. GET /api/runs/[runId] has returned everything
  /// needed here from the start; nothing called it.
  ///
  /// Returns whether the caller should stand down. `false` means there is no run
  /// to resume and the normal cold-start path should run.
  const resume = useCallback(async (): Promise<boolean> => {
    const stored = loadStoredRun(gameSlug, mode);
    if (!stored) return false;

    const generation = ++generationRef.current;
    setPhase("starting");
    setError(null);

    let state: RunState;
    try {
      state = await fetchRunState(stored.runId, stored.runToken);
    } catch {
      // A 404 (purged run, or a token that no longer matches) is indistinguishable
      // from a network failure here, and neither is worth surfacing: the player
      // asked for a game, not for an explanation of the previous one.
      clearStoredRun(mode);
      return false;
    }
    if (generation !== generationRef.current) return true;

    // The key is scoped by game and mode, but the payload is the authority on
    // what the run actually is — trust it over the key it was filed under.
    if (state.gameSlug !== gameSlug || state.mode !== mode) {
      clearStoredRun(mode);
      return false;
    }

    // Yesterday's daily is not today's. It can still be inside its 180-minute
    // TTL well past midnight, so the day is the thing to check, not the clock.
    // UTC, matching how the API derives its own dayKey.
    if (mode === "DAILY" && state.dayKey !== new Date().toISOString().slice(0, 10)) {
      clearStoredRun(mode);
      return false;
    }

    // Only PRACTICE may be dropped for age, and only because dropping it there
    // costs nothing — the next POST /api/runs just deals a fresh run.
    //
    // In DAILY the same rule was a lockout. `expiresAt` is advisory: no route
    // checks it, nothing ever writes status EXPIRED, so /guess, /skip and
    // /giveup all keep working on a run whose TTL has passed. Treating it as
    // fatal here therefore threw away a run the SERVER was still happy to
    // continue — and since a daily with guesses on it answers 409
    // `already_started`, the cold start that followed could only fail, leaving
    // the player on the error dialog with a Retry that re-fails forever and
    // today's board unplayable. Sitting on the page for three hours (or a clock
    // running slightly fast) was enough to trigger it.
    const expired = state.expiresAt !== null && Date.parse(state.expiresAt) <= Date.now();
    const tooOld = mode === "PRACTICE" && expired;
    const finished = state.runStatus !== "IN_PROGRESS";
    // A finished run is still worth restoring in DAILY: the day's board is over
    // either way, and POST /api/runs answers 409 `already_started` for it, so
    // dropping it would land the player on an error dialog instead of their own
    // result. PRACTICE just starts another run, so there is nothing to keep.
    const usable = finished ? mode === "DAILY" : state.current !== null && !tooOld;
    if (!usable) {
      clearStoredRun(mode);
      return false;
    }

    tokenRef.current = stored.runToken;
    resetRoundView();

    setRunId(state.runId);
    setRunStatus(state.runStatus);
    setEraState(state.decadeFilter);
    setLives(state.livesRemaining);

    // The totals the stats panel reads. All Run columns, all server-owned.
    setStreak(state.currentStreak);
    setBestStreak(state.bestStreak);
    setScore(state.score);
    setRoundsSolved(state.roundsSolved);
    setRoundsPlayed(state.roundsSolved + state.roundsFailed);

    // Newest first, the order applyResult builds. `resolvedAt` is what makes the
    // "3m ago" column true after a reload rather than restarting from "just now".
    const past = [...state.past].sort((a, b) => b.roundIndex - a.roundIndex);
    setRoundHistory(
      past.flatMap((round) =>
        round.song
          ? [
              {
                song: round.song,
                solved: round.outcome === "SOLVED",
                attemptsUsed: round.attemptsUsed,
                at: round.resolvedAt ? Date.parse(round.resolvedAt) : Date.now(),
              },
            ]
          : [],
      ),
    );

    if (state.current) {
      const current = state.current;
      setRoundIndex(current.roundIndex);
      setStage(current.stageReached);
      setAttemptsUsed(current.attemptsUsed);
      setHint(current.hint);
      setGuesses(
        current.attempts.map((attempt) => ({
          song: attempt.song,
          // Carried through, not dropped. This used to be a hard `null`, on the
          // belief that the server refuses a repeat guess anyway — it does not.
          // Nothing in the attempt path rejects a puzzle this round has already
          // named, so an empty exclusion set let the typeahead re-offer a song
          // that had already missed and the repeat spent a real attempt. On a
          // ranked one-run-a-day board that made a mid-round refresh cost a
          // guess, which is the one thing a resume must never do.
          puzzleId: attempt.puzzleId,
          correct: attempt.isCorrect,
          skipped: attempt.isSkip,
          at: Date.now(),
        })),
      );
      setYoutubeVideoId(current.youtubeVideoId);
      setHookStartMs(current.hookStartMs);
      setPhase("ready");

      if (state.nextAudio) playInlineAudio(state.nextAudio, generation);
      else if (!current.youtubeVideoId) await loadAudio(state.runId, generation);

      return true;
    }

    // Finished DAILY: no current round, so the last resolved one is the view.
    const last = past[0];
    setRoundIndex(last?.roundIndex ?? 1);
    setStage(last?.stageReached ?? 1);
    setAttemptsUsed(last?.attemptsUsed ?? 0);
    setStatus(last?.outcome ?? "FAILED");
    setReveal(last?.song ?? null);
    setLastPoints(last?.points ?? null);
    setPhase("ready");
    return true;
  }, [gameSlug, mode, loadAudio, playInlineAudio, resetRoundView]);

  /// A stored run is resumed wherever there is one. Failing that: PRACTICE lands
  /// on the era picker, DAILY starts immediately (no era choice).
  /// Runs once on mount.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    void (async () => {
      if (await resume()) return;
      if (mode === "DAILY") await begin();
      else setPhase("selecting");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /// Fold an attempt response into local state.
  const applyResult = useCallback(
    (result: AttemptResult, record: GuessRecord) => {
      // Settle the optimistic slot rather than appending beside it. Falls back to
      // appending for any path that didn't claim one first.
      setGuesses((previous) => {
        const optimistic = previous.findIndex((entry) => entry.pending);
        if (optimistic === -1) return [...previous, record];

        const next = [...previous];
        next[optimistic] = record;
        return next;
      });
      setAttemptsUsed(result.attemptsUsed);
      setStage(result.stageReached);
      setLives(result.livesRemaining);
      setRunStatus(result.runStatus);
      setHint(result.hint);
      // Server-owned, both of them. The streak rule (scoring/v1.ts) is not
      // re-implemented here — this hook used to derive it from `stageReached`
      // and quietly disagreed with the run the moment that rule changed.
      setStreak(result.currentStreak);
      setBestStreak(result.bestStreak);
      if (result.score !== undefined) setScore(result.score);

      if (result.outcome === "PENDING") {
        // Keep YouTube state in sync for ongoing rounds.
        setYoutubeVideoId(result.youtubeVideoId);
        setHookStartMs(result.hookStartMs);
        return;
      }

      // Round resolved. The server has already opened the next one (or finished
      // the run); the result panel is what the player sees until they advance.
      nextRoundAudioRef.current =
        result.runStatus === "IN_PROGRESS" ? result.nextAudio : null;
      nextRoundYoutubeRef.current =
        result.runStatus === "IN_PROGRESS"
          ? { videoId: result.youtubeVideoId, hookStartMs: result.hookStartMs }
          : null;

      setStatus(result.outcome);
      setReveal(result.reveal);
      setLastPoints(result.points);
      setRoundsPlayed((count) => count + 1);

      if (result.outcome === "SOLVED") setRoundsSolved((count) => count + 1);

      if (result.reveal) {
        setRoundHistory((history) => [
          {
            song: result.reveal!,
            solved: result.outcome === "SOLVED",
            attemptsUsed: result.attemptsUsed,
            at: Date.now(),
          },
          ...history,
        ]);
      }
    },
    [],
  );

  /// Claim the attempt slot before the request goes out, and hand back the undo.
  ///
  /// This is the whole perceived-latency fix on the client: the board used to sit
  /// completely still from the keystroke until the response landed, which read as
  /// the app having missed the input. Everything claimed here is something the
  /// server is about to confirm anyway — the slot is spent either way — so the
  /// only thing withheld is the verdict.
  const claimAttempt = useCallback(
    (record: Omit<GuessRecord, "pending">) => {
      const spent = attemptsUsed;
      setGuesses((previous) => [...previous, { ...record, pending: true }]);
      setAttemptsUsed(spent + 1);
      // The previous miss belongs to the previous attempt — clear it as soon as
      // the next one is submitted rather than leaving it to time out over the
      // answer that replaced it.
      setMiss(null);

      return () => {
        setGuesses((previous) => previous.filter((entry) => !entry.pending));
        setAttemptsUsed(spent);
      };
    },
    [attemptsUsed],
  );

  /// Shared tail for every attempt: settle state, then get audio in front of the
  /// player without another request where possible.
  const settleAttempt = useCallback(
    async (
      id: string,
      generation: number,
      result: AttemptResult,
      record: Omit<GuessRecord, "pending">,
    ) => {
      applyResult(result, {
        ...record,
        correct: result.outcome === "SOLVED",
        pending: false,
      });

      if (result.outcome === "PENDING") {
        // A named guess that left the round open is a miss, and the only one the
        // player needs told: a skip was their own doing, and a resolved round
        // gets the result panel.
        if (record.song && !record.skipped) {
          setMiss({
            id: ++missIdRef.current,
            guessed: record.song,
            attemptsRemaining: Math.max(0, maxAttempts - result.attemptsUsed),
            unlockedMs: revealLadder[result.stageReached - 1] ?? null,
          });
        }

        // YouTube rounds stream directly — no bytes to fetch.
        if (result.nextAudio) playInlineAudio(result.nextAudio, generation);
        else if (!result.youtubeVideoId) await loadAudio(id, generation);

        // Skipping IS the request for the next clip — the player spent an
        // attempt on nothing else. Play it for them rather than leaving the
        // longer window sitting behind a play button. A miss is not treated the
        // same: they were listening for an answer, not for more tape, and
        // starting audio under the miss flash talks over it.
        if (record.skipped && generation === generationRef.current) {
          setAutoPlayToken((token) => token + 1);
        }
        return;
      }

      // Best-effort reveal audio for stored songs only.
      if (!result.youtubeVideoId) await loadRevealAudio(id, generation);
    },
    [applyResult, playInlineAudio, loadAudio, loadRevealAudio, maxAttempts, revealLadder],
  );

  const guess = useCallback(
    async (match: CatalogMatch) => {
      const id = runId;
      const token = tokenRef.current;
      if (!id || !token || pendingAction || status !== "PENDING") return;

      const generation = generationRef.current;
      const record = {
        song: { title: match.title, artist: match.artist },
        puzzleId: match.puzzleId,
        correct: false,
        skipped: false,
        at: Date.now(),
      };

      const undo = claimAttempt(record);
      setPendingAction("guess");
      try {
        const result = await submitGuess(id, token, {
          guessedPuzzleId: match.puzzleId,
          rawInput: `${match.title} — ${match.artist}`,
          idempotencyKey: newIdempotencyKey(),
        });
        if (generation !== generationRef.current) return;

        await settleAttempt(id, generation, result, record);
      } catch (cause) {
        if (generation !== generationRef.current) return;
        undo();
        setError(messageFor(cause, "That guess didn't go through."));
      } finally {
        setPendingAction(null);
      }
    },
    [runId, pendingAction, status, claimAttempt, settleAttempt],
  );

  const skip = useCallback(async () => {
    const id = runId;
    const token = tokenRef.current;
    if (!id || !token || pendingAction || status !== "PENDING") return;

    const generation = generationRef.current;
    const record = {
      song: null,
      puzzleId: null,
      correct: false,
      skipped: true,
      at: Date.now(),
    };

    const undo = claimAttempt(record);
    setPendingAction("skip");
    try {
      const result = await skipRound(id, token, newIdempotencyKey());
      if (generation !== generationRef.current) return;

      await settleAttempt(id, generation, result, record);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      undo();
      setError(messageFor(cause, "That skip didn't go through."));
    } finally {
      setPendingAction(null);
    }
  }, [runId, pendingAction, status, claimAttempt, settleAttempt]);

  /// One request. This used to loop /skip until the round resolved — six
  /// sequential requests over six sequential transactions, for an outcome the
  /// server produces in a single pass.
  const giveUp = useCallback(async () => {
    const id = runId;
    const token = tokenRef.current;
    if (!id || !token || pendingAction || status !== "PENDING") return;

    const generation = generationRef.current;
    setPendingAction("giveup");
    try {
      const result = await giveUpRound(id, token, newIdempotencyKey());
      if (generation !== generationRef.current) return;

      applyResult(result, {
        song: null,
        puzzleId: null,
        correct: false,
        skipped: true,
        at: Date.now(),
      });

      // A give-up spends every slot the round had left, not just one. Pad the
      // timeline out to the server's count, or the board shows "4 left" on a
      // round that is over — which the looping version did too, since it applied
      // only the final skip's result.
      setGuesses((previous) => {
        if (previous.length >= result.attemptsUsed) return previous;
        const at = Date.now();
        return [
          ...previous,
          ...Array.from({ length: result.attemptsUsed - previous.length }, () => ({
            song: null,
            puzzleId: null,
            correct: false,
            skipped: true,
            at,
          })),
        ];
      });

      // YOUTUBE-ONLY: was an unconditional `await loadRevealAudio(id, generation)`.
      //
      // It was the one reveal fetch with no `!youtubeVideoId` guard, which was
      // survivable while stored clips existed and merely wasteful on a YouTube
      // round — loadRevealAudio is best-effort and swallows its failure. With the
      // stored-clip route retired it is a guaranteed 410 on every give-up, so it
      // is gone rather than left to fail quietly. The reveal for a YouTube round
      // is the embedded player seeking back to the hook, not a blob URL.
      if (!youtubeVideoId) await loadRevealAudio(id, generation);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(messageFor(cause, "Giving up failed."));
    } finally {
      if (generation === generationRef.current) setPendingAction(null);
    }
  }, [runId, pendingAction, status, applyResult, loadRevealAudio, youtubeVideoId]);

  /// Move to the round the server already opened when this one resolved. If the
  /// run itself finished, start a new one (PRACTICE) or stay on the results (DAILY).
  const nextRound = useCallback(async () => {
    if (runStatus !== "IN_PROGRESS") {
      if (mode === "DAILY") return; // daily runs don't loop — show the final result
      await begin();
      return;
    }

    const id = runId;
    if (!id) return;

    const generation = ++generationRef.current;
    resetRoundView();
    setRoundIndex((index) => index + 1);
    releaseAudio();
    setAudioUrl(null);

    // Apply next round's YouTube info before loading audio.
    const nextYoutube = nextRoundYoutubeRef.current;
    nextRoundYoutubeRef.current = null;
    setYoutubeVideoId(nextYoutube?.videoId ?? null);
    setHookStartMs(nextYoutube?.hookStartMs ?? 0);

    // Stage 1 of this round was delivered with the attempt that resolved the last one.
    const inline = nextRoundAudioRef.current;
    nextRoundAudioRef.current = null;
    if (inline) playInlineAudio(inline, generation);
    else if (!nextYoutube?.videoId) await loadAudio(id, generation);
  }, [mode, runStatus, runId, begin, resetRoundView, releaseAudio, loadAudio, playInlineAudio]);

  const restartRun = useCallback(() => {
    void begin();
  }, [begin]);

  /// Switch era category. There's no way to re-filter an in-progress run's
  /// remaining rounds server-side, so this always starts a fresh one.
  const setEra = useCallback(
    (next: DecadeFilter | null) => {
      void begin(next);
    },
    [begin],
  );

  const revealMs = revealLadder[stage - 1] ?? revealLadder[0] ?? 0;
  const totalMs = revealLadder[revealLadder.length - 1] ?? 0;

  return {
    phase,
    error,
    dismissError: useCallback(() => setError(null), []),

    runId,
    runStatus,
    era,
    setEra,
    roundIndex,
    stage,
    attemptsUsed,
    attemptsRemaining: maxAttempts - attemptsUsed,
    revealMs,
    totalMs,
    revealLadder,
    maxAttempts,
    guesses,
    status,
    hint,
    reveal,
    lastPoints,
    miss,
    dismissMiss: useCallback(() => setMiss(null), []),

    lives,
    streak,
    bestStreak,
    score,
    roundsPlayed,
    roundsSolved,
    roundHistory,

    audioUrl,
    audioLoading,
    revealAudioUrl,
    revealAudioLoading,
    youtubeVideoId,
    hookStartMs,
    autoPlayToken,
    pending: pendingAction !== null,
    pendingAction,

    guess,
    skip,
    giveUp,
    nextRound,
    restartRun,
  };
}

/// Prefer the server's message — "No playable puzzles are available right
/// now. Please come back after some time." is far more useful than a generic
/// failure, and the API only ever returns messages that are safe to show.
function messageFor(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message;
  return fallback;
}

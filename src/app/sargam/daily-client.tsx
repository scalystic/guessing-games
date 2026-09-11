"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "@/lib/get-current-user";
import type { GameDetail } from "@/lib/games";
import { useMelodleGame } from "@/hooks/useMelodleGame";
import { PlayerBar } from "@/components/PlayerBar";
import { AttemptTimeline } from "@/components/AttemptTimeline";
import { GuessAutocomplete } from "@/components/GuessAutocomplete";
import { MissFlash } from "@/components/MissFlash";
import { ResultPanel } from "@/components/ResultPanel";
import { GameHeader } from "@/components/GameHeader";
import { GameMenu } from "@/components/GameMenu";
import { StreakPill } from "@/components/StreakPill";
import { Modal } from "@/components/Modal";
import { HowToPlayList } from "@/components/HowToPlayList";
import { StatsList } from "@/components/StatsList";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { Leaderboard } from "@/components/Leaderboard";
import { DailyStreakStrip } from "@/components/DailyStreakStrip";
import { DailyCalendarModal } from "@/components/DailyCalendarModal";
import { useDailyHistory } from "@/hooks/useDailyHistory";
import { RunErrorDialog } from "@/components/RunErrorDialog";
import { DailySharePoster } from "@/components/DailySharePoster";
import { MultiplayerEntry } from "@/components/MultiplayerEntry";
import { LeaderboardGate } from "@/components/LeaderboardGate";

function formatSeconds(milliseconds: number) {
  const seconds = milliseconds / 1000;
  return seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? seconds : seconds.toFixed(1);
}

/// Shown wherever today's set is closed to this player — already played, or
/// finished. There is no practice mode to send them to any more, so the only
/// useful thing left to say is when the next one opens.
///
/// Midnight UTC because that is what the day key actually is: the /today route
/// keys off `new Date().toISOString().slice(0, 10)`. Spelled out rather than
/// left as "tomorrow", which is wrong for anyone east of UTC in the hours
/// before their local midnight.
const NEXT_SET_NOTE = "A new set unlocks every day at midnight UTC.";

/// One finished round as the /today route reports it. Only used here now, to
/// count how many songs were named on the first listen.
type ResultRound = { solved: boolean; attemptsUsed: number };

/// Songs named with nothing unlocked past the opening window — attempt one,
/// solved. Every miss or skip unlocks more audio, so this is exactly the set
/// of songs caught in the ladder's first slice.
function countInstantSolves(rounds: ResultRound[]) {
  return rounds.filter((round) => round.solved && round.attemptsUsed === 1).length;
}

type ChallengeInfo = {
  id: string;
  title: string | null;
  dayKey: string;
  roundCount: number;
  rewardCoins: number;
  rewardXp: number;
  alreadyPlayed: boolean;
  runStatus: string | null;
  result: {
    score: number;
    roundsSolved: number;
    maxAttempts: number;
    roundHistory: ResultRound[];
  } | null;
};

function formatDay(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/// The chrome every daily state renders inside — header, menu, streak strip —
/// so the "not played yet", "already played" and "no challenge today" screens
/// can't drift apart.
///
/// Takes the whole GameDetail rather than a slug plus an attempt count: the
/// multiplayer picker lives in here now (see below) and wants the reveal ladder
/// and tagline too.
function PageShell({
  user,
  config,
  showHelp,
  onHelp,
  onHelpClose,
  runCompleted = false,
  children,
}: {
  user: CurrentUser;
  config: GameDetail;
  showHelp: boolean;
  onHelp: () => void;
  onHelpClose: () => void;
  /// Flips true the moment this player's daily run finishes. Feeds the history
  /// refetch so the streak pill and the week strip pick up today — they are
  /// fetched on mount, which is before the run was played.
  runCompleted?: boolean;
  children: React.ReactNode;
}) {
  const history = useDailyHistory(config.slug, runCompleted);
  // Same refetch trigger as the history above: finishing today's run is exactly
  // when the lifetime rollup moves, and the panel is most likely to be opened
  // right after it.
  const playerStats = usePlayerStats(config.slug, runCompleted);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);

  // min-h-full, not min-h-screen — same reason as the Sargam shell: the root
  // layout renders a footer below <main>, so pinning this to the viewport
  // height would put a scrollbar on every daily-challenge screen.
  return (
    <div className="page-backdrop min-h-full text-(--text)">
      <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 pb-12 pt-3.5 [@media(max-height:820px)]:pt-2 sm:px-6 sm:pb-16 sm:pt-5">
        <GameHeader subtitle="Daily challenge" accentSubtitle>
          <StreakPill
            current={history.streak}
            ariaLabel={`Daily streak: ${history.streak ?? 0} days. Open calendar.`}
            onClick={() => setShowCalendar(true)}
          />
          <GameMenu
            user={user}
            items={[
              // Multiplayer moved in here from the practice screen when that
              // screen stopped being a place players go. Held back for now —
              // the row stays listed so players know the mode is coming, but
              // it does not open the picker.
              {
                icon: "multiplayer",
                label: "Multiplayer",
                hint: "Play a room with friends",
                badge: "Soon",
                disabled: true,
              },
              {
                icon: "stats",
                label: "Stats",
                hint: "Streaks, rank and badges",
                onClick: () => setShowStats(true),
              },
              {
                icon: "calendar",
                label: "Daily calendar",
                hint: "Every day you've played",
                onClick: () => setShowCalendar(true),
              },
              { icon: "help", label: "How to play", hint: "Rules in ten seconds", onClick: onHelp },
            ]}
          />
        </GameHeader>

        {children}

        {/* Below the deck, not above it: as a band up top this pushed the
            player past the fold on a phone. */}
        <div className="mt-6 border-t border-(--hairline) pt-4">
          <DailyStreakStrip days={history.week} onOpenCalendar={() => setShowCalendar(true)} />
        </div>
      </div>

      {showHelp && (
        <Modal title="How to play" onClose={onHelpClose}>
          <HowToPlayList maxAttempts={config.maxAttempts} />
        </Modal>
      )}

      {showStats && (
        <Modal title="Your stats" onClose={() => setShowStats(false)}>
          {playerStats ? (
            <StatsList
              stats={playerStats.stats}
              progression={playerStats.progression}
              hasPlayed={playerStats.hasPlayed}
            />
          ) : (
            <p className="py-6 text-center text-sm text-(--text-faint)">Loading…</p>
          )}
        </Modal>
      )}

      {showCalendar && (
        <DailyCalendarModal gameSlug={config.slug} onClose={() => setShowCalendar(false)} />
      )}

      {/* Mounted out here, not inside the menu: its trigger is a menu row, and
          the menu unmounts on click, which would take the picker with it. */}
      <MultiplayerEntry
        gameSlug={config.slug}
        tagline={config.tagline}
        revealLadder={config.revealLadder}
        maxAttempts={config.maxAttempts}
        user={user}
        open={showMultiplayer}
        onOpenChange={setShowMultiplayer}
      />
    </div>
  );
}

function AlreadyPlayedPanel({
  info,
  firstRevealMs,
  user,
}: {
  info: ChallengeInfo;
  firstRevealMs: number;
  user: CurrentUser;
}) {
  const completed = info.runStatus === "COMPLETED";
  const boardVisible = user?.kind === "USER" && user.handle !== null;

  if (completed && info.result) {
    return (
      <ChallengeCompletePanel
        roundsSolved={info.result.roundsSolved}
        roundCount={info.roundCount}
        score={info.result.score}
        dayKey={info.dayKey}
        instantSolves={countInstantSolves(info.result.roundHistory)}
        firstRevealMs={firstRevealMs}
        user={user}
      />
    );
  }

  /// Rewards are per-challenge and default to 0, which is the common case. An
  /// empty "—" tile just advertises a reward slot that today has nothing in it,
  /// so drop the tile entirely and let Rounds take the full width.
  const hasRewards = info.rewardCoins > 0 || info.rewardXp > 0;

  return (
    <div className="flex flex-col items-center py-12">
      <div className="w-full max-w-sm rounded-[14px] border border-(--hairline) bg-(--surface-strong) p-6 shadow-xl">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--signal)">
          Daily Challenge
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight text-(--text)">
          {info.title ?? "Today's Challenge"}
        </h2>
        <p className="mt-1 text-xs text-(--text-faint)">{formatDay(info.dayKey)}</p>

        <div className={`mt-4 grid gap-2 ${hasRewards ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-(--text)">{info.roundCount}</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Rounds</p>
          </div>
          {hasRewards && (
            <div className="rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2.5 text-center">
              {info.rewardCoins > 0 && <p className="text-sm font-bold text-amber-500">{info.rewardCoins} coins</p>}
              {info.rewardXp > 0 && <p className="text-sm font-bold text-(--success)">{info.rewardXp} XP</p>}
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Rewards</p>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-(--hairline) bg-(--surface) px-4 py-3 text-center">
          <p className="text-sm font-semibold text-(--text-dim)">
            {completed
              ? "You already completed today's challenge!"
              : "You already started today's challenge."}
          </p>
        </div>

        {/* Same rule as the completion panel — the board is for named
            players, and this screen shows it to the same people. */}
        {boardVisible ? (
          <div className="mt-4 text-left">
            <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--text-faint)">
              Today&apos;s Leaderboard
            </p>
            <Leaderboard dayKey={info.dayKey} accent="var(--signal)" />
          </div>
        ) : (
          <div className="mt-4 flex justify-center">
            <LeaderboardGate reason={user?.kind === "USER" ? "no-username" : "guest"} />
          </div>
        )}

        {/* Used to be a "Back to Home" link. Home is this page now, so the
            honest thing to offer is when the next set lands. */}
        <p className="mt-4 text-center text-xs text-(--text-faint)">{NEXT_SET_NOTE}</p>
      </div>
    </div>
  );
}

function ChallengeCompletePanel({
  roundsSolved,
  roundCount,
  score,
  dayKey,
  instantSolves,
  firstRevealMs,
  user,
}: {
  roundsSolved: number;
  roundCount: number;
  score: number;
  dayKey: string;
  instantSolves: number;
  firstRevealMs: number;
  /// Decides whether the leaderboard renders or the gate does. Keyed on
  /// `handle`, not `kind`: an account that hasn't claimed a username yet has
  /// nothing to be listed under, so it gets the gate too — pointed at
  /// /username instead of signup.
  user: CurrentUser;
}) {
  const [board, setBoard] = useState<{ rank: number | null; total: number | null }>({
    rank: null,
    total: null,
  });

  /// Who gets the board, and who gets the gate in its place.
  const boardVisible = user?.kind === "USER" && user.handle !== null;

  // The poster prints today's standing, which only exists server-side — and
  // only once completeRun() has written this player's leaderboard row, which
  // has happened by the time this panel mounts.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/daily-challenge/leaderboard?dayKey=${encodeURIComponent(dayKey)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.data) return;
        setBoard({ rank: json.data.you?.rank ?? null, total: json.data.total ?? null });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [dayKey]);

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center sm:py-12">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
          Challenge Complete
        </p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold text-(--text)">
          {roundsSolved === roundCount ? "Perfect!" : `${roundsSolved} / ${roundCount} solved`}
        </p>
      </div>

      {/* Poster is NOT gated: it is the daily's word-of-mouth loop, and a
          guest who just finished should still be able to send their result to
          someone. It prints a rank, which the /leaderboard route hands out to
          anyone — being ranked and being able to read the board are separate
          things here. */}
      <DailySharePoster
        dayKey={dayKey}
        rank={board.rank}
        totalPlayers={board.total}
        roundsSolved={roundsSolved}
        roundCount={roundCount}
        instantSolves={instantSolves}
        firstRevealMs={firstRevealMs}
        score={score}
      />

      {boardVisible ? (
        <div className="w-full max-w-sm text-left">
          <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--text-faint)">
            Today&apos;s Leaderboard
          </p>
          <Leaderboard dayKey={dayKey} accent="var(--signal)" />
        </div>
      ) : (
        <LeaderboardGate reason={user?.kind === "USER" ? "no-username" : "guest"} />
      )}

      <p className="text-xs text-(--text-faint)">{NEXT_SET_NOTE}</p>
    </div>
  );
}

// Inner component — only mounts when we know the player hasn't played yet.
function DailyGame({
  user,
  config,
  roundCount,
  dayKey,
}: {
  user: CurrentUser;
  config: GameDetail;
  roundCount: number | null;
  dayKey: string;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  const game = useMelodleGame({
    gameSlug: config.slug,
    revealLadder: config.revealLadder,
    maxAttempts: config.maxAttempts,
    mode: "DAILY",
  });

  // Its own fetch rather than one threaded down from PageShell: the rollup is
  // written when the run completes, and runStatus is the value that changes at
  // exactly that moment, so keying on it here is what makes the end-of-run
  // panel show numbers that have actually moved.
  const playerStats = usePlayerStats(config.slug, game.runStatus);

  const resolved = game.status !== "PENDING";
  const nextRevealMs = game.revealLadder[game.stage] ?? null;

  const excludePuzzleIds = useMemo(
    () =>
      new Set(
        game.guesses
          .map((entry) => entry.puzzleId)
          .filter((id): id is string => id !== null),
      ),
    [game.guesses],
  );

  const prompt =
    resolved
      ? game.status === "SOLVED"
        ? "Signal found."
        : "Signal missed."
      : game.phase === "starting" || game.audioLoading
        ? game.roundIndex === 1
          ? "Tuning your first signal…"
          : "Tuning the next signal…"
        : game.pendingAction === "guess"
          ? "Checking that answer…"
          : game.pendingAction === "skip"
            ? `Unlocking ${nextRevealMs ? formatSeconds(nextRevealMs) : "more"} seconds…`
            : game.pendingAction === "giveup"
              ? "Revealing the mystery track…"
              : `You have ${formatSeconds(game.revealMs)} seconds. Know it?`;

  return (
    <PageShell
      user={user}
      config={config}
      showHelp={showHelp}
      onHelp={() => setShowHelp(true)}
      onHelpClose={() => setShowHelp(false)}
      runCompleted={game.runStatus === "COMPLETED"}
    >
      {game.error && game.phase === "error" ? (
        <RunErrorDialog
          message={game.error}
          onRetry={game.restartRun}
          onClose={game.dismissError}
        />
      ) : null}

      {game.error && game.phase !== "error" ? (
        <div className="mt-5 flex items-start gap-3 rounded-[8px] border border-(--miss) bg-(--surface) px-4 py-3 text-sm text-(--text)" role="alert">
          <svg className="mt-0.5 shrink-0 text-(--miss)" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M10 3l7 13H3L10 3z" strokeLinejoin="round" />
            <path d="M10 7.2v4.4M10 14.2h.01" strokeLinecap="round" />
          </svg>
          <span className="flex-1 leading-5">{game.error}</span>
          <button
            type="button"
            onClick={game.dismissError}
            className="shrink-0 text-xs font-bold text-(--text-dim) underline decoration-(--hairline) underline-offset-4 hover:text-(--text)"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {showCompletion ? (
        <ChallengeCompletePanel
          roundsSolved={game.roundsSolved}
          roundCount={roundCount ?? game.roundsSolved}
          score={game.score}
          dayKey={dayKey}
          instantSolves={countInstantSolves(game.roundHistory)}
          firstRevealMs={config.revealLadder[0] ?? 0}
          user={user}
        />
      ) : (
        <section className="py-3 [@media(max-height:820px)]:py-2 sm:py-5" aria-labelledby="mystery-track-title">
          {/* Round progress rides the eyebrow line — the same slot and chip
              shape the practice screen uses for its loaded tape. As its own
              band under the header it cost 45px of the fold, the difference
              between seeing the guess box on a short phone and not. */}
          <div className="mb-3 sm:mb-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
                Mystery track
              </p>
              {game.phase !== "starting" && roundCount !== null ? (
                <div
                  className="flex h-9 [@media(max-height:700px)]:h-8 shrink-0 items-center gap-2 rounded-full border border-(--hairline) bg-(--surface) px-3"
                  aria-label={`Round ${game.roundIndex} of ${roundCount}`}
                >
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {Array.from({ length: roundCount }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-2 w-2 rounded-full transition-colors ${
                          i < game.roundsSolved
                            ? "bg-(--signal)"
                            : i === game.roundIndex - 1
                              ? "ring-2 ring-inset ring-(--signal)"
                              : "bg-(--hairline)"
                        }`}
                      />
                    ))}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
                    Round {game.roundIndex}/{roundCount}
                  </span>
                </div>
              ) : null}
            </div>
            <h1 id="mystery-track-title" className="mt-2 max-w-xl text-balance font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.05] tracking-[-0.02em] text-(--text) [@media(max-height:820px)]:mt-1 [@media(max-height:820px)]:text-xl sm:text-3xl">
              {prompt}
            </h1>
          </div>

          <PlayerBar
            audioUrl={game.audioUrl}
            youtubeVideoId={game.youtubeVideoId}
            hookStartMs={game.hookStartMs}
            revealMs={game.revealMs}
            totalMs={game.totalMs}
            ladder={game.revealLadder}
            loading={game.audioLoading || game.phase === "starting"}
            waveformSeed={`${game.runId ?? "run"}:${game.roundIndex}`}
            autoPlayToken={game.autoPlayToken}
            attemptIndicator={
              <AttemptTimeline
                guesses={game.guesses}
                currentAttempt={game.attemptsUsed + 1}
                maxAttempts={game.maxAttempts}
              />
            }
            unlockingMs={game.pendingAction === "skip" ? nextRevealMs : null}
          />

          {game.hint && !resolved ? (
            <div className="mt-4 border-l-2 border-(--signal) bg-(--surface) px-4 py-3 text-sm text-(--text-dim)">
              <span className="font-semibold text-(--text)">Clue: </span>
              {[game.hint.decade, game.hint.genre, game.hint.firstLetter ? `starts with "${game.hint.firstLetter}"` : null]
                .filter((part): part is string => part !== null)
                .join(" · ")}
            </div>
          ) : null}

          {!resolved ? (
            <div className="mt-3.5 [@media(max-height:820px)]:mt-2">
              <GuessAutocomplete
                gameSlug={config.slug}
                excludePuzzleIds={excludePuzzleIds}
                pendingAction={game.pendingAction}
                nextRevealMs={nextRevealMs}
                disabled={game.pending || game.audioLoading || game.phase !== "ready"}
                onGuess={(match) => void game.guess(match)}
                onSkip={() => void game.skip()}
                onGiveUp={() => void game.giveUp()}
              />
            </div>
          ) : null}

          {!resolved && (game.pendingAction === "guess" || game.pendingAction === "giveup") ? (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-(--scrim) p-4"
              role="status"
              aria-live="polite"
            >
              <div className="panel-in relative flex w-full max-w-xs flex-col items-center gap-5 overflow-hidden rounded-[14px] border border-(--hairline) bg-(--surface-strong) px-8 py-10 text-center shadow-2xl">
                <div
                  className="pointer-events-none absolute -inset-10 -z-10 animate-pulse rounded-full opacity-20 blur-3xl"
                  style={{ background: "radial-gradient(circle, var(--signal) 0%, transparent 70%)" }}
                  aria-hidden="true"
                />
                <span className="cassette-reel h-16 w-16" data-playing="true" aria-hidden="true" />
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
                    {game.pendingAction === "giveup" ? "Revealing" : "Checking"}
                  </p>
                  <p className="mt-1.5 font-[family-name:var(--font-display)] text-lg font-semibold leading-tight text-(--text)">
                    {game.pendingAction === "giveup" ? "Uncovering the mystery track…" : "Locking in your answer…"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {!resolved ? <MissFlash feedback={game.miss} onDone={game.dismissMiss} /> : null}

          {resolved && game.reveal ? (
            <ResultPanel
              reveal={game.reveal}
              status={game.status}
              attemptsUsed={game.attemptsUsed}
              maxAttempts={game.maxAttempts}
              revealMs={game.revealMs}
              points={game.lastPoints}
              guesses={game.guesses}
              streak={game.streak}
              score={game.score}
              fullAudioUrl={game.revealAudioUrl}
              youtubeVideoId={game.youtubeVideoId}
              audioLoading={game.revealAudioLoading}
              nextLabel={game.runStatus === "COMPLETED" ? "See results" : "Next track"}
              onNext={() => {
                if (game.runStatus === "COMPLETED") {
                  setShowCompletion(true);
                } else {
                  void game.nextRound();
                }
              }}
              // Only once the run is over: the lifetime rollup is written at
              // completion, so mid-run this would be a bar that never moves.
              progression={
                game.runStatus === "COMPLETED" ? (playerStats?.progression ?? null) : null
              }
            />
          ) : null}
        </section>
      )}
    </PageShell>
  );
}

export default function DailyClient({ user, game: config }: { user: CurrentUser; game: GameDetail }) {
  const [challengeInfo, setChallengeInfo] = useState<ChallengeInfo | null>(null);
  const [infoLoaded, setInfoLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    fetch(`/api/daily-challenge/today?gameSlug=${encodeURIComponent(config.slug)}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setChallengeInfo(json.data); })
      .catch(() => null)
      .finally(() => setInfoLoaded(true));
  }, [config.slug]);

  // Show a loading skeleton while checking play status.
  if (!infoLoaded) {
    return (
      <PageShell
        user={user}
        config={config}
        showHelp={showHelp}
        onHelp={() => setShowHelp(true)}
        onHelpClose={() => setShowHelp(false)}
      >
        <div className="flex flex-1 items-center justify-center py-20">
          <span className="cassette-reel h-12 w-12" data-playing="true" aria-hidden="true" />
        </div>
      </PageShell>
    );
  }

  // No challenge today.
  if (!challengeInfo) {
    return (
      <PageShell
        user={user}
        config={config}
        showHelp={showHelp}
        onHelp={() => setShowHelp(true)}
        onHelpClose={() => setShowHelp(false)}
      >
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-sm text-(--text-dim)">No daily challenge is available today.</p>
          <p className="mt-2 text-xs text-(--text-faint)">{NEXT_SET_NOTE}</p>
        </div>
      </PageShell>
    );
  }

  // Already played — show the info panel instead of starting the game.
  if (challengeInfo.alreadyPlayed) {
    return (
      <PageShell
        user={user}
        config={config}
        showHelp={showHelp}
        onHelp={() => setShowHelp(true)}
        onHelpClose={() => setShowHelp(false)}
      >
        <AlreadyPlayedPanel
          info={challengeInfo}
          firstRevealMs={config.revealLadder[0] ?? 0}
          user={user}
        />
      </PageShell>
    );
  }

  // Not yet played — mount the game.
  return (
    <DailyGame
      user={user}
      config={config}
      roundCount={challengeInfo.roundCount}
      dayKey={challengeInfo.dayKey}
    />
  );
}

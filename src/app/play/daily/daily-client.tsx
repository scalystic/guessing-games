"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Leaderboard } from "@/components/Leaderboard";
import { DailyStreakStrip } from "@/components/DailyStreakStrip";
import { DailyCalendarModal } from "@/components/DailyCalendarModal";
import { useDailyHistory } from "@/hooks/useDailyHistory";
import { RunErrorDialog } from "@/components/RunErrorDialog";

function formatSeconds(milliseconds: number) {
  const seconds = milliseconds / 1000;
  return seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? seconds : seconds.toFixed(1);
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
};

function formatDay(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PageShell({
  user,
  gameSlug,
  maxAttempts,
  showHelp,
  onHelp,
  onHelpClose,
  children,
}: {
  user: CurrentUser;
  gameSlug: string;
  maxAttempts: number;
  showHelp: boolean;
  onHelp: () => void;
  onHelpClose: () => void;
  children: React.ReactNode;
}) {
  const history = useDailyHistory(gameSlug);
  const [showCalendar, setShowCalendar] = useState(false);

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
              { icon: "home", label: "Practice mode", hint: "Unlimited rounds, any era", href: "/" },
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
          <HowToPlayList maxAttempts={maxAttempts} />
        </Modal>
      )}

      {showCalendar && (
        <DailyCalendarModal gameSlug={gameSlug} onClose={() => setShowCalendar(false)} />
      )}
    </div>
  );
}

function AlreadyPlayedPanel({ info }: { info: ChallengeInfo }) {
  const completed = info.runStatus === "COMPLETED";
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-(--text)">{info.roundCount}</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Rounds</p>
          </div>
          <div className="rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2.5 text-center">
            {info.rewardCoins > 0 || info.rewardXp > 0 ? (
              <>
                {info.rewardCoins > 0 && <p className="text-sm font-bold text-amber-500">{info.rewardCoins} coins</p>}
                {info.rewardXp > 0 && <p className="text-sm font-bold text-(--success)">{info.rewardXp} XP</p>}
              </>
            ) : (
              <p className="text-sm font-bold text-(--text-faint)">—</p>
            )}
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Rewards</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-(--hairline) bg-(--surface) px-4 py-3 text-center">
          <p className="text-sm font-semibold text-(--text-dim)">
            {completed
              ? "You already completed today's challenge!"
              : "You already started today's challenge."}
          </p>
        </div>

        <div className="mt-4 text-left">
          <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--text-faint)">
            Today&apos;s Leaderboard
          </p>
          <Leaderboard dayKey={info.dayKey} accent="var(--signal)" />
        </div>

        <Link
          href="/"
          className="mt-4 block w-full rounded-xl border border-(--hairline) px-4 py-2.5 text-center text-sm font-semibold text-(--text-dim) transition hover:bg-(--surface-hover) hover:text-(--text)"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}

function ChallengeCompletePanel({
  roundsSolved,
  roundCount,
  score,
  dayKey,
}: {
  roundsSolved: number;
  roundCount: number;
  score: number;
  dayKey: string;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
          Challenge Complete
        </p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold text-(--text)">
          {roundsSolved === roundCount ? "Perfect!" : `${roundsSolved} / ${roundCount} solved`}
        </p>
      </div>

      <div className="flex gap-4">
        <div className="rounded-2xl border border-(--hairline) bg-(--surface) px-6 py-4 text-center">
          <p className="text-2xl font-bold text-(--signal)">{roundsSolved}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Solved</p>
        </div>
        <div className="rounded-2xl border border-(--hairline) bg-(--surface) px-6 py-4 text-center">
          <p className="text-2xl font-bold text-(--text)">{score.toLocaleString()}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Score</p>
        </div>
      </div>

      <div className="w-full max-w-sm text-left">
        <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--text-faint)">
          Today&apos;s Leaderboard
        </p>
        <Leaderboard dayKey={dayKey} accent="var(--signal)" />
      </div>

      <Link
        href="/"
        className="rounded-xl border border-(--hairline) px-5 py-2.5 text-sm font-semibold text-(--text-dim) transition hover:bg-(--surface-hover) hover:text-(--text)"
      >
        Back to Home
      </Link>
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
      gameSlug={config.slug}
      maxAttempts={config.maxAttempts}
      showHelp={showHelp}
      onHelp={() => setShowHelp(true)}
      onHelpClose={() => setShowHelp(false)}
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
          />

          <div className="mt-3.5 [@media(max-height:820px)]:mt-2.5">
            <AttemptTimeline
              guesses={game.guesses}
              currentAttempt={game.attemptsUsed + 1}
              maxAttempts={game.maxAttempts}
            />
          </div>

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
              roundsSolved={game.roundsSolved}
              bestStreak={game.bestStreak}
              roundHistory={game.roundHistory}
              level={game.level}
              xpProgress={game.xpProgress}
              xpPerLevel={game.xpPerLevel}
              rankName={game.rankName}
              achievements={game.achievements}
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
        gameSlug={config.slug}
        maxAttempts={config.maxAttempts}
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
        gameSlug={config.slug}
        maxAttempts={config.maxAttempts}
        showHelp={showHelp}
        onHelp={() => setShowHelp(true)}
        onHelpClose={() => setShowHelp(false)}
      >
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-sm text-(--text-dim)">No daily challenge is available today.</p>
          <Link href="/" className="mt-4 text-sm font-semibold text-(--signal) underline underline-offset-4">
            Back to Home
          </Link>
        </div>
      </PageShell>
    );
  }

  // Already played — show the info panel instead of starting the game.
  if (challengeInfo.alreadyPlayed) {
    return (
      <PageShell
        user={user}
        gameSlug={config.slug}
        maxAttempts={config.maxAttempts}
        showHelp={showHelp}
        onHelp={() => setShowHelp(true)}
        onHelpClose={() => setShowHelp(false)}
      >
        <AlreadyPlayedPanel info={challengeInfo} />
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

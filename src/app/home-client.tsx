"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/get-current-user";
import type { GameDetail } from "@/lib/games";
import { useMelodleGame } from "@/hooks/useMelodleGame";
import { useNow } from "@/hooks/useNow";
import { PlayerBar } from "@/components/PlayerBar";
import { AttemptTimeline } from "@/components/AttemptTimeline";
import { GuessAutocomplete } from "@/components/GuessAutocomplete";
import { ResultPanel } from "@/components/ResultPanel";
import { ProfileMenu } from "@/components/ProfileMenu";
import { HowToPlayList } from "@/components/HowToPlayList";
import { Modal } from "@/components/Modal";
import { StatsList } from "@/components/StatsList";
import { RoundHistoryList } from "@/components/RoundHistoryList";

const FREE_GUEST_ROUNDS = 5;

function formatSeconds(milliseconds: number) {
  const seconds = milliseconds / 1000;
  return seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? seconds : seconds.toFixed(1);
}

function StatsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 16V9m6 7V4m6 12v-5" strokeLinecap="round" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.9 7.6a2.2 2.2 0 0 1 4.3.7c0 1.8-2.2 1.9-2.2 3.4M10 14.7h.01" strokeLinecap="round" />
    </svg>
  );
}

type HeaderActionProps = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

function HeaderAction({ label, icon, onClick }: HeaderActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-full border border-(--hairline) bg-(--surface) px-3 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function Home({ user, game: config }: { user: CurrentUser; game: GameDetail }) {
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const game = useMelodleGame({
    gameSlug: config.slug,
    revealLadder: config.revealLadder,
    maxAttempts: config.maxAttempts,
  });
  const now = useNow();

  const isGuest = !user || user.kind === "GUEST";
  const guestLimitReached = isGuest && game.roundsPlayed >= FREE_GUEST_ROUNDS;
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

  function handleNextRound() {
    if (guestLimitReached) {
      setShowAuthGate(true);
      return;
    }
    void game.nextRound();
  }

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
            : `You have ${formatSeconds(game.revealMs)} seconds. Know it?`;

  return (
    <div className="page-backdrop min-h-screen text-(--text)">
      <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 pb-12 pt-5 sm:px-6 sm:pb-16 sm:pt-8">
        <header className="flex items-center justify-between gap-4 border-b border-(--hairline) pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-1.5 bg-(--signal)" aria-hidden="true" />
              <p className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-none tracking-[0.04em] text-(--text)">
                SARGAM
              </p>
            </div>
            <p className="mt-1.5 truncate pl-4 font-mono text-[9px] uppercase tracking-[0.18em] text-(--text-faint)">
              The seven-second song game
            </p>
          </div>

          <nav className="flex shrink-0 items-center gap-2" aria-label="Game controls">
            <HeaderAction label="Stats" icon={<StatsIcon />} onClick={() => setShowStats(true)} />
            <HeaderAction label="How to play" icon={<HelpIcon />} onClick={() => setShowHelp(true)} />
            <ProfileMenu user={user} />
          </nav>
        </header>

        <section className="grid grid-cols-3 border-b border-(--hairline)" aria-label="Current session">
          <div className="border-r border-(--hairline) py-3 pr-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-(--text-faint)">Track</p>
            <p className="mt-1 text-sm font-semibold text-(--text)">{String(game.roundIndex).padStart(2, "0")}</p>
          </div>
          <div className="border-r border-(--hairline) px-3 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-(--text-faint)">Score</p>
            <p className="mt-1 text-sm font-semibold text-(--text)">{game.score.toLocaleString()}</p>
          </div>
          <div className="py-3 pl-3 text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-(--text-faint)">Streak</p>
            <p className="mt-1 text-sm font-semibold text-(--text)">{game.streak}</p>
          </div>
        </section>

        {game.error ? (
          <div className="mt-5 flex items-start gap-3 rounded-[8px] border border-(--miss) bg-(--surface) px-4 py-3 text-sm text-(--text)" role="alert">
            <svg className="mt-0.5 shrink-0 text-(--miss)" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M10 3l7 13H3L10 3z" strokeLinejoin="round" />
              <path d="M10 7.2v4.4M10 14.2h.01" strokeLinecap="round" />
            </svg>
            <span className="flex-1 leading-5">{game.error}</span>
            <button
              type="button"
              onClick={game.phase === "error" ? game.restartRun : game.dismissError}
              className="shrink-0 text-xs font-bold text-(--text-dim) underline decoration-(--hairline) underline-offset-4 hover:text-(--text)"
            >
              {game.phase === "error" ? "Try again" : "Dismiss"}
            </button>
          </div>
        ) : null}

        <section className="py-7 sm:py-9" aria-labelledby="mystery-track-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
                Mystery signal · Track {String(game.roundIndex).padStart(2, "0")}
              </p>
              <h1 id="mystery-track-title" className="mt-2 max-w-xl text-balance font-[family-name:var(--font-display)] text-4xl font-semibold leading-[0.95] tracking-[-0.025em] text-(--text) sm:text-5xl">
                {prompt}
              </h1>
            </div>
          </div>

          <PlayerBar
            audioUrl={game.audioUrl}
            revealMs={game.revealMs}
            totalMs={game.totalMs}
            ladder={game.revealLadder}
            loading={game.audioLoading || game.phase === "starting"}
            waveformSeed={`${game.runId ?? "run"}:${game.roundIndex}`}
          />

          <div className="mt-5">
            <AttemptTimeline
              guesses={game.guesses}
              currentAttempt={game.attemptsUsed + 1}
              maxAttempts={game.maxAttempts}
            />
          </div>

          {game.hint && !resolved ? (
            <div className="mt-4 border-l-2 border-(--signal) bg-(--surface) px-4 py-3 text-sm text-(--text-dim)">
              <span className="font-semibold text-(--text)">Clue: </span>
              {[game.hint.decade, game.hint.genre, game.hint.firstLetter ? `starts with “${game.hint.firstLetter}”` : null]
                .filter((part): part is string => part !== null)
                .join(" · ")}
            </div>
          ) : null}

          {!resolved ? (
            <div className="mt-5">
              <GuessAutocomplete
                gameSlug={config.slug}
                excludePuzzleIds={excludePuzzleIds}
                pendingAction={game.pendingAction}
                nextRevealMs={nextRevealMs}
                disabled={game.pending || game.audioLoading || game.phase !== "ready"}
                onGuess={(match) => void game.guess(match)}
                onSkip={() => void game.skip()}
              />
            </div>
          ) : null}

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
              audioLoading={game.revealAudioLoading}
              onNext={handleNextRound}
            />
          ) : null}
        </section>

        <RoundHistoryList entries={game.roundHistory} now={now} />

        <footer className="mt-8 flex items-center justify-between gap-4 border-t border-(--hairline) pt-4 text-xs text-(--text-faint)">
          <p>One clip. Six attempts. No rewinds beyond what you unlock.</p>
          <p className="shrink-0 font-mono uppercase tracking-[0.12em]">v1 · Practice</p>
        </footer>
      </div>

      {showHelp ? (
        <Modal title="How to play" onClose={() => setShowHelp(false)}>
          <HowToPlayList maxAttempts={game.maxAttempts} />
        </Modal>
      ) : null}

      {showStats ? (
        <Modal title="Your session" onClose={() => setShowStats(false)}>
          <StatsList
            streak={game.streak}
            bestStreak={game.bestStreak}
            score={game.score}
            roundsPlayed={game.roundsPlayed}
            roundsSolved={game.roundsSolved}
          />
        </Modal>
      ) : null}

      {showAuthGate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--scrim) p-4" role="dialog" aria-modal="true" aria-labelledby="save-session-title">
          <div className="w-full max-w-sm rounded-[12px] border border-(--hairline) bg-(--surface-strong) p-6 shadow-2xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--signal)">Five tracks played</p>
            <h2 id="save-session-title" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold leading-none text-(--text)">
              Keep this run.
            </h2>
            <p className="mt-3 text-sm leading-6 text-(--text-dim)">
              Create an account to continue and save your score, streak, and track history.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href="/login" className="rounded-[7px] border border-(--hairline) px-3 py-3 text-center text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover)">
                Log in
              </Link>
              <Link href="/signup" className="rounded-[7px] bg-(--signal) px-3 py-3 text-center text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]">
                Save my run
              </Link>
            </div>
            <button type="button" onClick={() => setShowAuthGate(false)} className="mt-3 w-full py-2 text-sm font-semibold text-(--text-faint) hover:text-(--text)">
              Not now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

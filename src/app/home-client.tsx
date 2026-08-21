"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/get-current-user";
import type { GameDetail } from "@/lib/games";
import { THEMES } from "@/data/themes";
import { getServerThemeColor, getThemeColor, setThemeColor, subscribeThemeColor } from "@/lib/theme-color";
import { useMelodleGame } from "@/hooks/useMelodleGame";
import { useNow } from "@/hooks/useNow";
import { PlayerBar } from "@/components/PlayerBar";
import { AttemptTimeline } from "@/components/AttemptTimeline";
import { GuessAutocomplete } from "@/components/GuessAutocomplete";
import { ResultPanel } from "@/components/ResultPanel";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import { HowToPlayList } from "@/components/HowToPlayList";
import { Sidebar } from "@/components/Sidebar";
import { Modal } from "@/components/Modal";
import { StatsList } from "@/components/StatsList";
import { Leaderboard } from "@/components/Leaderboard";
import { Achievements } from "@/components/Achievements";
import { DailyHit } from "@/components/DailyHit";
import { Challenge } from "@/components/Challenge";
import { ThemeSwatchGrid } from "@/components/ThemeSwatchGrid";
import { QuoteFooter } from "@/components/QuoteFooter";
import { HeroBanner } from "@/components/HeroBanner";
import { RoundHistoryList } from "@/components/RoundHistoryList";
import { LiveBackground } from "@/components/LiveBackground";

// Free rounds a guest gets before a round-limit gate asks them to sign up.
// Signed-in accounts (kind === "USER") never hit this.
const FREE_GUEST_ROUNDS = 5;

function HeaderIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children}
      <span className="text-[10px] text-(--text-faint)">{label}</span>
    </div>
  );
}

export default function Home({ user, game: config }: { user: CurrentUser; game: GameDetail }) {
  const theme = useSyncExternalStore(subscribeThemeColor, getThemeColor, getServerThemeColor);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showDailyHit, setShowDailyHit] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const game = useMelodleGame({
    gameSlug: config.slug,
    revealLadder: config.revealLadder,
    maxAttempts: config.maxAttempts,
  });
  const now = useNow();

  const isGuest = !user || user.kind === "GUEST";
  const guestLimitReached = isGuest && game.roundsPlayed >= FREE_GUEST_ROUNDS;

  // The typeahead deals in puzzleIds, so exclusion is keyed on those. Guesses
  // recovered from a resume have a null id and stay offerable — a much smaller
  // cost than having the resume payload enumerate wrong answers.
  const excludePuzzleIds = useMemo(
    () =>
      new Set(
        game.guesses
          .map((entry) => entry.puzzleId)
          .filter((id): id is string => id !== null),
      ),
    [game.guesses],
  );

  const resolved = game.status !== "PENDING";
  const accent = theme.solid;

  function shuffleTheme() {
    const others = THEMES.filter((t) => t.name !== theme.name);
    const pick = others[Math.floor(Math.random() * others.length)] ?? THEMES[0];
    setThemeColor(pick);
  }

  function handleNavSelect(key: string) {
    if (key === "help") setShowHelp(true);
    else if (key === "stats") setShowStats(true);
    else if (key === "settings") setShowSettings(true);
    else if (key === "leaderboard") setShowLeaderboard(true);
    else if (key === "achievements") setShowAchievements(true);
    else if (key === "daily") setShowDailyHit(true);
    else if (key === "challenge") setShowChallenge(true);
  }

  function handleNextRound() {
    if (guestLimitReached) {
      setShowAuthGate(true);
      return;
    }
    void game.nextRound();
  }

  function handlePlayNow() {
    if (guestLimitReached) {
      setShowAuthGate(true);
      return;
    }
    game.restartRun();
  }

  return (
    <div className="page-backdrop relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-8 text-(--text) sm:py-12">
      <LiveBackground />

      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        accent={accent}
        gradientFrom={theme.from}
        gradientTo={theme.to}
        streak={game.streak}
        roundsSolved={game.roundsSolved}
        onSelect={handleNavSelect}
        onPlayNow={handlePlayNow}
      />

      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-5">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-(--hairline) bg-(--surface) text-(--text-dim) transition hover:scale-105 hover:bg-(--surface-hover) active:scale-95"
              aria-label="Open menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 5h14M3 10h14M3 15h14" />
              </svg>
            </button>
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-black shadow-lg"
              style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
            >
              🎬
            </span>
            <div>
              <h1
                className="shimmer-text font-[family-name:var(--font-display)] text-3xl font-bold leading-none tracking-tight"
                style={{
                  backgroundImage: `linear-gradient(100deg, var(--text) 0%, var(--text) 45%, ${theme.from} 50%, var(--text) 55%, var(--text) 100%)`,
                }}
              >
                Sargam
              </h1>
              <p className="mt-1 text-[11px] leading-none text-(--text-faint)">guess the Bollywood hit</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HeaderIcon label="Help">
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-(--hairline) bg-(--surface) text-lg font-semibold text-(--text-dim) transition hover:scale-105 hover:bg-(--surface-hover) active:scale-95"
                aria-label="How to play"
              >
                ?
              </button>
            </HeaderIcon>
            <HeaderIcon label="Profile">
              <ProfileMenu accent={accent} themes={THEMES} activeTheme={theme} onThemeChange={setThemeColor} user={user} />
            </HeaderIcon>
          </div>
        </header>

        {/* Marquee divider */}
        <div className="flex items-center justify-center gap-3" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="marquee-dot h-1 w-1 rounded-full"
              style={{ background: theme.from, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>

        {/* Lives + streak — the state that matters while you're mid-round */}
        <div className="flex items-center justify-center gap-3">
          {/* <div
            className="flex shrink-0 items-center gap-1 rounded-2xl border border-[#cf9c4e]/15 bg-(--surface) px-4 py-2.5"
            aria-label={`${game.lives} of 3 lives left`}
          >
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className="text-base" style={{ opacity: i < game.lives ? 1 : 0.25 }}>
                ❤️
              </span>
            ))}
            <span className="ml-1 text-sm font-semibold text-(--text)">Lives Left</span>
          </div> */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-[#cf9c4e]/15 bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text)">
            <span>🔥</span>
            Streak {game.streak}
          </div>
        </div>

        {/* Anything the server refused, in the server's own words — "No playable
            puzzles are available right now." is more use than a generic sorry. */}
        {game.error && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#f87171]/40 bg-[#f87171]/10 px-4 py-3 text-sm text-(--text)">
            <span aria-hidden="true">⚠️</span>
            <span className="flex-1">{game.error}</span>
            <button
              type="button"
              onClick={game.phase === "error" ? game.restartRun : game.dismissError}
              className="shrink-0 rounded-lg border border-(--hairline) bg-(--surface) px-3 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
            >
              {game.phase === "error" ? "Try again" : "Dismiss"}
            </button>
          </div>
        )}

        {/* Game card */}
        <div
          className="flex flex-col gap-5 rounded-3xl border p-5 shadow-2xl shadow-black/20 backdrop-blur-sm dark:shadow-black/50"
          style={{ borderColor: `${accent}30`, background: "var(--surface)" }}
        >
          <HeroBanner from={theme.from} to={theme.to} />

          <PlayerBar
            audioUrl={game.audioUrl}
            revealMs={game.revealMs}
            totalMs={game.totalMs}
            ladder={game.revealLadder}
            accent={accent}
            loading={game.audioLoading || game.phase === "starting"}
            // Per round, so the shape changes with the song but holds still
            // while the ladder advances within a round.
            waveformSeed={`${game.runId ?? "run"}:${game.roundIndex}`}
          />

          <AttemptTimeline
            guesses={game.guesses}
            currentAttempt={game.attemptsUsed + 1}
            maxAttempts={game.maxAttempts}
            accent={accent}
          />

          {/* Hint fields are individually nullable — a catalog entry may have no
              release year or no genre — so render only what's actually there. */}
          {game.hint && !resolved && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2 text-xs text-(--text-dim)">
              <span className="font-semibold text-(--text)">Hint:</span>
              {[
                game.hint.decade,
                game.hint.genre,
                game.hint.firstLetter ? `starts with “${game.hint.firstLetter}”` : null,
              ]
                .filter((part): part is string => part !== null)
                .map((part, i) => (
                  <span key={part} className="flex items-center gap-2">
                    {i > 0 && <span className="text-(--text-faint)">·</span>}
                    <span>{part}</span>
                  </span>
                ))}
            </div>
          )}

          {!resolved && (
            <GuessAutocomplete
              gameSlug={config.slug}
              excludePuzzleIds={excludePuzzleIds}
              accent={accent}
              disabled={game.pending || game.phase !== "ready"}
              onGuess={(match) => void game.guess(match)}
              onSkip={() => void game.skip()}
            />
          )}

          {resolved && game.reveal && (
            <ResultPanel
              reveal={game.reveal}
              status={game.status}
              attemptsUsed={game.attemptsUsed}
              maxAttempts={game.maxAttempts}
              points={game.lastPoints}
              guesses={game.guesses}
              streak={game.streak}
              score={game.score}
              accent={accent}
              fullAudioUrl={game.revealAudioUrl}
              audioLoading={game.revealAudioLoading}
              onNext={handleNextRound}
            />
          )}
        </div>

        <RoundHistoryList entries={game.roundHistory} now={now} />

        <QuoteFooter accent={accent} />
      </div>

      {showHelp && (
        <Modal title="How to play" accent={accent} onClose={() => setShowHelp(false)}>
          <HowToPlayList maxAttempts={game.maxAttempts} />
        </Modal>
      )}

      {showStats && (
        <Modal title="Your stats" accent={accent} onClose={() => setShowStats(false)}>
          <StatsList
            streak={game.streak}
            bestStreak={game.bestStreak}
            score={game.score}
            roundsPlayed={game.roundsPlayed}
            roundsSolved={game.roundsSolved}
          />
        </Modal>
      )}

      {showSettings && (
        <Modal title="Settings" accent={accent} onClose={() => setShowSettings(false)}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--text-faint)">
            Theme color
          </p>
          <ThemeSwatchGrid themes={THEMES} active={theme} onChange={setThemeColor} onShuffle={shuffleTheme} />
          <p className="mt-4 flex items-center justify-between text-sm text-(--text-dim)">
            Appearance
            <ThemeModeToggle />
          </p>
        </Modal>
      )}

      {showDailyHit && (
        <Modal title="Daily Hit" accent={accent} onClose={() => setShowDailyHit(false)}>
          <DailyHit accent={accent} />
        </Modal>
      )}

      {showChallenge && (
        <Modal title="Challenge" accent={accent} onClose={() => setShowChallenge(false)}>
          <Challenge accent={accent} />
        </Modal>
      )}

      {showLeaderboard && (
        <Modal title="Leaderboard" accent={accent} onClose={() => setShowLeaderboard(false)}>
          <Leaderboard score={game.score} accent={accent} />
        </Modal>
      )}

      {showAchievements && (
        <Modal title="Achievements" accent={accent} onClose={() => setShowAchievements(false)}>
          <Achievements
            accent={accent}
            roundsPlayed={game.roundsPlayed}
            roundsSolved={game.roundsSolved}
            bestStreak={game.bestStreak}
            roundHistory={game.roundHistory}
          />
        </Modal>
      )}

      {showAuthGate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--scrim) p-4 backdrop-blur-sm"
          onClick={() => setShowAuthGate(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border p-6"
            style={{ borderColor: `${accent}30`, background: "var(--surface-strong)" }}
          >
            <p className="font-[family-name:var(--font-display)] text-xl font-bold text-(--text)">
              You&apos;ve played your {FREE_GUEST_ROUNDS} free rounds
            </p>
            <p className="mt-1 text-sm text-(--text-dim)">
              Sign up to keep your streak going and save your progress, or log in if you already have an account.
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <Link
                href="/signup"
                className="rounded-xl py-2.5 text-center text-sm font-semibold text-black transition hover:scale-[1.02] active:scale-95"
                style={{ background: accent }}
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-(--hairline) bg-(--surface) py-2.5 text-center text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/get-current-user";
import { SONGS } from "@/data/songs";
import { useMelodleGame, MAX_ATTEMPTS } from "@/hooks/useMelodleGame";
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

// Jewel-tone palette pulled from film-poster & festival colors (marigold,
// vermillion, peacock, gulaal, royal) rather than the violet/cyan gradient
// that's become shorthand for "generated UI".
const THEMES = [
  { name: "Marigold", from: "#f6c453", to: "#c0392b", solid: "#f6c453" },
  { name: "Sindoor", from: "#ff6b6b", to: "#f9ca24", solid: "#ff8577" },
  { name: "Peacock", from: "#0f9b8e", to: "#f6c453", solid: "#2dd4bf" },
  { name: "Gulaal", from: "#e84393", to: "#fdcb6e", solid: "#f472b6" },
  { name: "Royal", from: "#2c3e91", to: "#f6c453", solid: "#f6c453" },
];

function HeaderIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children}
      <span className="text-[10px] text-(--text-faint)">{label}</span>
    </div>
  );
}

export default function Home({ user }: { user: CurrentUser }) {
  const [theme, setTheme] = useState(THEMES[0]);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showDailyHit, setShowDailyHit] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const game = useMelodleGame();
  const now = useNow();

  const isGuest = !user || user.kind === "GUEST";
  const guestLimitReached = isGuest && game.roundsPlayed >= FREE_GUEST_ROUNDS;

  const excludeIds = useMemo(
    () => new Set(game.guesses.filter((g) => g.song).map((g) => g.song!.id)),
    [game.guesses],
  );

  const resolved = game.status !== "PENDING";
  const accent = theme.solid;

  function shuffleTheme() {
    const others = THEMES.filter((t) => t.name !== theme.name);
    const pick = others[Math.floor(Math.random() * others.length)] ?? THEMES[0];
    setTheme(pick);
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
    game.nextRound();
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
              <ProfileMenu accent={accent} themes={THEMES} activeTheme={theme} onThemeChange={setTheme} user={user} />
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
            className="flex shrink-0 items-center gap-1 rounded-2xl border border-[#f6c453]/15 bg-(--surface) px-4 py-2.5"
            aria-label={`${game.lives} of 3 lives left`}
          >
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className="text-base" style={{ opacity: i < game.lives ? 1 : 0.25 }}>
                ❤️
              </span>
            ))}
            <span className="ml-1 text-sm font-semibold text-(--text)">Lives Left</span>
          </div> */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-[#f6c453]/15 bg-(--surface) px-4 py-2.5 text-sm font-semibold text-(--text)">
            <span>🔥</span>
            Streak {game.streak}
          </div>
        </div>

        {/* Game card */}
        <div
          className="flex flex-col gap-5 rounded-3xl border p-5 shadow-2xl shadow-black/20 backdrop-blur-sm dark:shadow-black/50"
          style={{ borderColor: `${accent}30`, background: "var(--surface)" }}
        >
          <HeroBanner from={theme.from} to={theme.to} />

          <PlayerBar
            song={game.target}
            revealMs={game.revealMs}
            accent={accent}
            locked={resolved}
          />

          <AttemptTimeline
            guesses={game.guesses}
            currentAttempt={game.attemptsUsed + 1}
            accent={accent}
          />

          {game.hint && !resolved && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2 text-xs text-(--text-dim)">
              <span className="font-semibold text-(--text)">Hint:</span>
              <span>{game.hint.decade}</span>
              <span className="text-(--text-faint)">·</span>
              <span>{game.hint.genre}</span>
              {"firstLetter" in game.hint && (
                <>
                  <span className="text-(--text-faint)">·</span>
                  <span>starts with “{game.hint.firstLetter}”</span>
                </>
              )}
            </div>
          )}

          {!resolved && (
            <GuessAutocomplete
              songs={SONGS}
              excludeIds={excludeIds}
              accent={accent}
              onGuess={(song) => game.submitGuess(song)}
              onSkip={() => game.submitGuess(null, true)}
            />
          )}

          {resolved && (
            <ResultPanel
              song={game.target}
              status={game.status}
              attemptsUsed={game.attemptsUsed}
              points={game.lastPoints}
              guesses={game.guesses}
              streak={game.streak}
              score={game.score}
              accent={accent}
              onNext={handleNextRound}
            />
          )}
        </div>

        <RoundHistoryList entries={game.roundHistory} now={now} />

        <QuoteFooter accent={accent} />

        <p className="pb-4 text-center text-[11px] text-(--text-faint)">
          Demo audio is a placeholder synth — real Bollywood clips arrive with the backend.
        </p>
      </div>

      {showHelp && (
        <Modal title="How to play" accent={accent} onClose={() => setShowHelp(false)}>
          <HowToPlayList maxAttempts={MAX_ATTEMPTS} />
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
          <ThemeSwatchGrid themes={THEMES} active={theme} onChange={setTheme} onShuffle={shuffleTheme} />
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

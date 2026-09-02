"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/get-current-user";
import type { GameDetail } from "@/lib/games";
import { useMelodleGame, type DecadeFilter } from "@/hooks/useMelodleGame";
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
import { MultiplayerEntry } from "@/components/MultiplayerEntry";
import { RunErrorDialog } from "@/components/RunErrorDialog";

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

function ChallengeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M7 2v4M13 2v4M3 9h14" strokeLinecap="round" />
    </svg>
  );
}

function StreakIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function BestStreakIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4.5A1.5 1.5 0 0 0 3 6.5c0 1.66 1.34 3 3 3M17 5h2.5A1.5 1.5 0 0 1 21 6.5c0 1.66-1.34 3-3 3" />
      <path d="M12 13v3M9 20h6M10 20v-1.5a2 2 0 0 1 4 0V20" />
    </svg>
  );
}

type HeaderActionProps = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

const ERA_OPTIONS: { value: DecadeFilter | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "NINETIES", label: "Old" },
  { value: "TWO_THOUSANDS", label: "New" },
];

function EraFilterControl({
  value,
  onChange,
  disabled,
}: {
  value: DecadeFilter | null;
  onChange: (next: DecadeFilter | null) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-(--hairline) bg-(--surface) p-1"
      role="group"
      aria-label="Song era"
    >
      {ERA_OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
            value === option.value
              ? "bg-(--signal) text-(--signal-ink)"
              : "text-(--text-faint) hover:bg-(--surface-hover) hover:text-(--text)"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const ERA_PICKER_OPTIONS: { value: DecadeFilter | null; label: string; hint: string; tilt: string }[] = [
  { value: null, label: "All eras", hint: "Every song in the catalog", tilt: "sm:-rotate-2" },
  { value: "NINETIES", label: "Old", hint: "1960 – 1999", tilt: "sm:rotate-1" },
  { value: "TWO_THOUSANDS", label: "New", hint: "2000 – now", tilt: "sm:-rotate-1" },
];

/// One cassette shell, rendered small. Reuses the exact `.cassette-reel`
/// mechanism from PlayerBar rather than a fresh illustration — when a tape is
/// picked, its reels physically spin, same as a loaded deck.
function TapeCard({
  option,
  selected,
  dimmed,
  onPick,
}: {
  option: (typeof ERA_PICKER_OPTIONS)[number];
  selected: boolean;
  dimmed?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      disabled={dimmed}
      style={{ background: "#171b2b" }}
      className={`group relative rounded-[14px] border p-4 text-center transition-all duration-200 disabled:cursor-not-allowed ${option.tilt} ${
        selected
          ? "-translate-y-1 rotate-0 border-2 border-(--signal) shadow-[0_18px_36px_-16px_rgba(217,157,47,0.6)]"
          : dimmed
            ? "border-[#2d3447] opacity-40"
            : "border-[#2d3447] hover:-translate-y-0.5 hover:rotate-0 hover:border-[#465074]"
      }`}
    >
      {/* Label window, echoing the cassette-shell stripe on the deck. */}
      <div className="relative flex items-center justify-center gap-2.5 rounded-[7px] border border-[#3e4761]/70 bg-gradient-to-r from-[#d99d2f]/10 via-[#3a7ad5]/15 to-[#d99d2f]/10 py-2.5">
        <span className="cassette-reel h-7 w-7 shrink-0 rounded-full" data-playing={selected} aria-hidden="true" />
        <span className="font-mono text-[6px] uppercase tracking-[0.25em] text-[#5b647d]">Sargam · Tape</span>
        <span className="cassette-reel h-7 w-7 shrink-0 rounded-full" data-playing={selected} aria-hidden="true" />
      </div>

      <span className="mt-3 block font-[family-name:var(--font-display)] text-xl font-semibold leading-none text-[#f2e9d8]">
        {option.label}
      </span>
      <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-[#8e93a3]">
        {option.hint}
      </span>
    </button>
  );
}

/// How long the picked tape sits in its selected state — reels spinning,
/// border lit — before the dialog actually closes.
const TAPE_LOAD_DELAY_MS = 1000;

/// Opened by pressing the deck's own play button before any era is chosen —
/// the game screen is already visible behind it. Picking a tape closes the
/// dialog and starts the round with that filter immediately; there's no
/// separate confirm step, since pressing play was already the confirm.
function EraDialog({
  onSelect,
  onClose,
}: {
  onSelect: (era: DecadeFilter | null) => void;
  onClose: () => void;
}) {
  const [pickedEra, setPickedEra] = useState<DecadeFilter | null | undefined>(undefined);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handlePick(era: DecadeFilter | null) {
    if (pickedEra !== undefined) return; // already loading a tape — ignore further clicks
    setPickedEra(era);
    setTimeout(() => onSelect(era), TAPE_LOAD_DELAY_MS);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--scrim) p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="era-dialog-title"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="panel-in w-full max-w-xl rounded-[14px] border border-(--hairline) bg-(--surface-strong) p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
              Load a tape
            </p>
            <h2
              id="era-dialog-title"
              className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-none text-(--text)"
            >
              Pick the decade you&apos;re playing.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--hairline) text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          className="mx-auto mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3"
          role="radiogroup"
          aria-label="Song era"
        >
          {ERA_PICKER_OPTIONS.map((option) => (
            <TapeCard
              key={option.label}
              option={option}
              selected={pickedEra === option.value}
              dimmed={pickedEra !== undefined && pickedEra !== option.value}
              onPick={() => handlePick(option.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

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

type TodayChallenge = {
  id: string;
  title: string | null;
  dayKey: string;
  roundCount: number;
  rewardCoins: number;
  rewardXp: number;
  alreadyPlayed: boolean;
  runStatus: string | null;
};

function TodaysChallengeModal({
  gameSlug,
  onClose,
}: {
  gameSlug: string;
  onClose: () => void;
}) {
  const [challenge, setChallenge] = useState<TodayChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/daily-challenge/today?gameSlug=${encodeURIComponent(gameSlug)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setChallenge(json.data);
        else setError(json.error?.message ?? "No challenge today.");
      })
      .catch(() => setError("Could not load today's challenge."))
      .finally(() => setLoading(false));
  }, [gameSlug]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function formatDay(dayKey: string) {
    const [y, m, d] = dayKey.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--scrim) p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="challenge-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-[14px] border border-(--hairline) bg-(--surface-strong) p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--signal)">
              Daily Challenge
            </p>
            <h2
              id="challenge-modal-title"
              className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight text-(--text)"
            >
              {loading ? "Loading…" : (challenge?.title ?? "Today's Challenge")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-(--text-faint) hover:bg-(--surface-hover) hover:text-(--text)"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {loading && (
          <p className="py-6 text-center text-sm text-(--text-faint)">Loading…</p>
        )}

        {!loading && error && (
          <p className="py-4 text-center text-sm text-(--text-dim)">{error}</p>
        )}

        {!loading && challenge && (
          <>
            <p className="mb-4 text-xs text-(--text-faint)">{formatDay(challenge.dayKey)}</p>

            <div className="mb-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2.5 text-center">
                <p className="text-xl font-bold text-(--text)">{challenge.roundCount}</p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Rounds</p>
              </div>
              <div className="rounded-xl border border-(--hairline) bg-(--surface) px-3 py-2.5 text-center">
                {challenge.rewardCoins > 0 || challenge.rewardXp > 0 ? (
                  <>
                    {challenge.rewardCoins > 0 && (
                      <p className="text-sm font-bold text-amber-500">{challenge.rewardCoins} coins</p>
                    )}
                    {challenge.rewardXp > 0 && (
                      <p className="text-sm font-bold text-violet-400">{challenge.rewardXp} XP</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm font-bold text-(--text-faint)">—</p>
                )}
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-(--text-faint)">Rewards</p>
              </div>
            </div>

            {challenge.alreadyPlayed ? (
              <div className="rounded-xl border border-(--hairline) bg-(--surface) px-4 py-3 text-center">
                <p className="text-sm font-semibold text-(--text-dim)">
                  {challenge.runStatus === "COMPLETED"
                    ? "You already completed today's challenge!"
                    : "You already started today's challenge."}
                </p>
              </div>
            ) : (
              <Link
                href="/play/daily"
                onClick={onClose}
                className="block w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:opacity-90"
              >
                Play Now
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Sargam({ user, game: config }: { user: CurrentUser; game: GameDetail }) {
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showEraDialog, setShowEraDialog] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
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
  /// A failed start leaves the deck empty, same as a fresh visit — so the
  /// dismissed error falls back to the tape picker instead of a dead player.
  const awaitingTape = game.phase === "selecting" || game.phase === "error";

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
    game.phase === "selecting"
      ? "Press play to load a tape."
      : resolved
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

  // min-h-full, not min-h-screen: the root layout now renders a footer below
  // <main>, so filling the whole viewport here would guarantee a scrollbar on
  // every game screen. Full height of the flex-1 <main> is what "as tall as the
  // space available" actually means — the same pattern the auth layout uses.
  return (
    <div className="page-backdrop min-h-full text-(--text)">
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
              The fifteen-second song game
            </p>
          </div>

          <nav className="flex shrink-0 items-center gap-2" aria-label="Game controls">
            <HeaderAction label="Daily" icon={<ChallengeIcon />} onClick={() => setShowChallenge(true)} />
            <HeaderAction label="Stats" icon={<StatsIcon />} onClick={() => setShowStats(true)} />
            <HeaderAction label="How to play" icon={<HelpIcon />} onClick={() => setShowHelp(true)} />
            <MultiplayerEntry gameSlug={config.slug} tagline={config.tagline} revealLadder={config.revealLadder} maxAttempts={config.maxAttempts} user={user} />
            <ProfileMenu user={user} />
          </nav>
        </header>

        <section className="flex flex-wrap items-center justify-center gap-3 border-b border-(--hairline) py-3.5" aria-label="Current session">
          <div className="flex items-center gap-3 rounded-full border border-(--hairline) bg-(--surface) px-4 py-1.5">
            <span className="flex items-center gap-2">
              <span className="text-(--signal)">
                <StreakIcon />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--text-faint)">Streak</span>
              <span className="text-sm font-bold text-(--signal)">{game.streak}</span>
            </span>
            <span className="h-4 w-px bg-(--hairline)" aria-hidden="true" />
            <span className="flex items-center gap-2">
              <span className="text-(--text-faint)">
                <BestStreakIcon />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--text-faint)">Best</span>
              <span className="text-sm font-bold text-(--text)">{game.bestStreak}</span>
            </span>
          </div>
          <EraFilterControl
            value={game.era}
            onChange={(next) => game.setEra(next)}
            disabled={game.pending || game.phase === "starting"}
          />
        </section>

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

        <section className="py-7 sm:py-9" aria-labelledby="mystery-track-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
                Mystery track
              </p>
              <h1 id="mystery-track-title" className="mt-2 max-w-xl text-balance font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.05] tracking-[-0.02em] text-(--text) sm:text-3xl">
                {prompt}
              </h1>
            </div>
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
            onPlayRequested={awaitingTape ? () => setShowEraDialog(true) : undefined}
            promptTitle={awaitingTape ? "Load a tape to begin" : undefined}
            promptSubtitle={awaitingTape ? "Pick an era and the round starts." : undefined}
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
            roundHistory={game.roundHistory}
            level={game.level}
            xpProgress={game.xpProgress}
            xpPerLevel={game.xpPerLevel}
            rankName={game.rankName}
            achievements={game.achievements}
          />
        </Modal>
      ) : null}

      {game.error && game.phase === "error" ? (
        <RunErrorDialog
          message={game.error}
          onRetry={game.restartRun}
          onClose={game.dismissError}
        />
      ) : null}

      {showEraDialog ? (
        <EraDialog
          onSelect={(era) => {
            setShowEraDialog(false);
            game.setEra(era);
          }}
          onClose={() => setShowEraDialog(false)}
        />
      ) : null}

      {showChallenge ? (
        <TodaysChallengeModal
          gameSlug={config.slug}
          onClose={() => setShowChallenge(false)}
        />
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

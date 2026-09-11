"use client";

import { useEffect, useRef, useState } from "react";
import type { RoundStatus } from "@/hooks/useMelodleGame";
import { nearestAchievements, type AchievementEntry, type Progression } from "@/lib/game/progression";
import type { Reveal } from "@/lib/api/runs";
import { fetchAlbumArtUrl } from "@/lib/album-art";
import { Confetti } from "@/components/Confetti";
import { songSubtitleWithYear, songTitle } from "@/lib/song-label";
import {
  loadYouTubeAPI,
  youtubeErrorMessage,
  YT_CONNECTION_ERROR_MESSAGE,
  YT_ENDED,
  YT_PLAYING,
  type YTPlayerInstance,
} from "@/lib/youtube";

type Props = {
  reveal: Reveal;
  status: RoundStatus;
  attemptsUsed: number;
  maxAttempts: number;
  revealMs: number;
  points: number | null;
  guesses: { correct: boolean; skipped: boolean }[];
  streak: number;
  score: number;
  fullAudioUrl: string | null;
  /// The round's YouTube video, when it streamed from YouTube rather than from a
  /// stored clip — which, since the server retired stored clips, is every round.
  /// Without it the play button below has nothing to play and sits disabled.
  youtubeVideoId?: string | null;
  audioLoading: boolean;
  onNext: () => void;
  nextLabel?: string;

  /// LIFETIME rank, level and badges — null while a run is still going.
  ///
  /// The rollup behind these is written once, when the run completes, so during
  /// a run every one of these numbers is the value it had at the first round.
  /// An XP bar that visibly refuses to move for ten rounds is worse than no XP
  /// bar, so the callers pass null until the run is over and this block simply
  /// isn't rendered. Per-round payoff is the points/score/streak row above.
  progression?: Progression | null;
};

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  return `${seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} seconds`;
}

/// How long to wait for a play() to actually produce audio before handing the
/// button back. Reaching this means the video never started — embed disabled,
/// region block, a dead network — and the disc would otherwise spin over silence
/// with no way back to "play". Same reasoning, and same budget, as PlayerBar's.
const YT_START_TIMEOUT_MS = 8_000;

export function ResultPanel({
  reveal,
  status,
  attemptsUsed,
  maxAttempts,
  revealMs,
  points,
  guesses,
  streak,
  score,
  fullAudioUrl,
  youtubeVideoId,
  audioLoading,
  onNext,
  nextLabel = "Next track",
  progression = null,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  /// Play has been pressed but no audio has reached the speakers yet. A cold
  /// embed takes a moment to load, and a disc that spins in silence reads as a
  /// dead button — the same lie PlayerBar's "Cueing" readout exists to avoid.
  const [cueing, setCueing] = useState(false);
  /// Why the last press produced no sound, or null. Without it a track that
  /// cannot play spins for eight seconds and then hands the button back with no
  /// explanation, which reads as a broken button rather than a broken network.
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const won = status === "SOLVED";

  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  /// Play was pressed before the player finished initializing — onReady starts
  /// the track rather than dropping the click on the floor.
  const ytPendingPlayRef = useRef(false);
  /// The video has been handed to loadVideoById, i.e. this player has actually
  /// started it rather than merely been constructed around it. Replays then use
  /// seek + play, which keeps the buffer instead of paying for a second load.
  const ytLoadedRef = useRef(false);
  const ytWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /// Last reason the embed gave for refusing to play, so a press that times out
  /// can report what YouTube said instead of a generic connection warning.
  const ytErrorRef = useRef<string | null>(null);

  // Safe to show the real cover here — the title/artist/album are already
  // revealed in plain text below, unlike the live PlayerBar deck.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAlbumArtUrl(reveal.title, reveal.artist, reveal.album).then((url) => {
      if (!cancelled) setCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [reveal.title, reveal.artist, reveal.album]);

  const progressPercent = progression
    ? Math.min(100, Math.max(0, (progression.xpProgress / progression.xpPerLevel) * 100))
    : 0;

  /// Four badges to show alongside the rank: the ones closest to unlocking
  /// first, so the panel ends on "two more days" rather than on a row of
  /// trophies already won. Unlocked badges backfill the row once there is
  /// nothing left to chase.
  ///
  /// A "New!" flash used to sit on top of this, computed from the current
  /// round — `roundsSolved === 1`, `attemptsUsed === 1` and so on, against badge
  /// ids that no longer exist. It cannot be rebuilt honestly here: unlocks are
  /// lifetime events now and this component only ever sees one snapshot, so
  /// there is nothing to diff against.
  const spotlight = progression ? nearestAchievements(progression.achievements, 4) : [];

  useEffect(() => {
    if (!fullAudioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(fullAudioUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    const done = () => setIsPlaying(false);
    audio.addEventListener("ended", done);

    return () => {
      audio.removeEventListener("ended", done);
      audio.pause();
      audioRef.current = null;
    };
  }, [fullAudioUrl]);

  /// Stand up a player for the revealed track.
  ///
  /// Deliberately its own player rather than PlayerBar's: that one is metered to
  /// the stage window and is mid-round bookkeeping for the NEXT track by the time
  /// this panel is up. This one has one job — play the song, whole, from the top.
  const ytVideoIdRef = useRef<string | null>(youtubeVideoId ?? null);
  useEffect(() => { ytVideoIdRef.current = youtubeVideoId ?? null; }, [youtubeVideoId]);

  useEffect(() => {
    if (!youtubeVideoId) return;

    let cancelled = false;
    loadYouTubeAPI(() => {
      if (cancelled || ytPlayerRef.current || !ytContainerRef.current || !window.YT) return;

      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: youtubeVideoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            ytReadyRef.current = true;
            // The panel appears and the player is clicked within the same second
            // or two, so the click regularly beats the embed's own load. Honour
            // it here rather than making them press play twice.
            if (ytPendingPlayRef.current) startYoutubeTrack();
          },
          onStateChange: (event) => {
            if (event.data === YT_PLAYING) {
              clearYoutubeWatchdog();
              setCueing(false);
              setIsPlaying(true);
              ytErrorRef.current = null;
              setPlaybackError(null);
              return;
            }
            if (event.data === YT_ENDED) {
              ytPendingPlayRef.current = false;
              clearYoutubeWatchdog();
              setCueing(false);
              setIsPlaying(false);
            }
          },
          onError: (event) => {
            // YouTube saying outright that this will not play. Worth acting on
            // immediately rather than waiting out the watchdog, and it carries
            // a better reason than a timeout can.
            //
            // Held, not shown, unless a press is actually in flight: the embed
            // can report a bad video while the panel is merely standing its
            // player up, and a warning about a track nobody asked to hear is
            // just noise on the answer screen.
            const message = youtubeErrorMessage(event.data);
            ytErrorRef.current = message;
            if (ytPendingPlayRef.current) failYoutubeTrack(message);
          },
        },
      });
    }, () => {
      // The IFrame API script never arrived, so the player above will never
      // exist and the disc would sit there doing nothing on every press.
      if (cancelled) return;
      setCueing(false);
      setIsPlaying(false);
      setPlaybackError(YT_CONNECTION_ERROR_MESSAGE);
    });

    return () => { cancelled = true; };
  // startYoutubeTrack is redefined every render and would rebuild the player on
  // each one; it reads its inputs from refs so capturing the first copy is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideoId]);

  // Tear the player down with the panel — the answer screen closing is the end
  // of the track, and a destroyed player is the only thing that stops an embed.
  useEffect(() => {
    return () => {
      if (ytWatchdogRef.current) clearTimeout(ytWatchdogRef.current);
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch { /* already gone */ }
        ytPlayerRef.current = null;
      }
    };
  }, []);

  function clearYoutubeWatchdog() {
    if (ytWatchdogRef.current) clearTimeout(ytWatchdogRef.current);
    ytWatchdogRef.current = null;
  }

  /// Give up on a play that never produced audio, so the button goes back to
  /// being a play button instead of a stop button over silence.
  function armYoutubeWatchdog() {
    clearYoutubeWatchdog();
    ytWatchdogRef.current = setTimeout(() => {
      ytWatchdogRef.current = null;
      if (!ytPendingPlayRef.current) return;
      failYoutubeTrack(ytErrorRef.current ?? YT_CONNECTION_ERROR_MESSAGE);
    }, YT_START_TIMEOUT_MS);
  }

  /// Hand the button back and say why nothing is playing.
  function failYoutubeTrack(message: string) {
    ytPendingPlayRef.current = false;
    // The load failed, so the buffer it would have left behind is not there;
    // send the next press back through loadVideoById rather than seek + play.
    ytLoadedRef.current = false;
    clearYoutubeWatchdog();
    try { ytPlayerRef.current?.pauseVideo(); } catch { /* unusable player */ }
    setCueing(false);
    setIsPlaying(false);
    setPlaybackError(message);
  }

  /// From the top, not from the hook: the clip is what they already heard, and
  /// this button offers the song.
  function startYoutubeTrack() {
    const player = ytPlayerRef.current;
    const videoId = ytVideoIdRef.current;
    if (!player || !ytReadyRef.current || !videoId) return;

    try {
      // PlayerBar primes its embed muted; this one may be looking at that same
      // player's leftovers on a shared API object, so never assume unmuted.
      player.unMute();
      if (ytLoadedRef.current) {
        player.seekTo(0, true);
        player.playVideo();
      } else {
        // loadVideoById is the API's load-and-play primitive. A player that has
        // only ever been constructed routinely swallows seekTo + playVideo — the
        // seek re-cues the video and the play lands on a player busy loading —
        // which is exactly the "first click does nothing" failure PlayerBar
        // documents at length.
        ytLoadedRef.current = true;
        player.loadVideoById({ videoId, startSeconds: 0 });
      }
    } catch {
      // Player object exists but isn't usable — the watchdog hands the button back.
    }
    armYoutubeWatchdog();
  }

  function stopYoutubeTrack() {
    ytPendingPlayRef.current = false;
    clearYoutubeWatchdog();
    try { ytPlayerRef.current?.pauseVideo(); } catch { /* already gone */ }
    setCueing(false);
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (youtubeVideoId) {
      if (isPlaying || cueing) {
        stopYoutubeTrack();
        return;
      }
      ytPendingPlayRef.current = true;
      setCueing(true);
      setPlaybackError(null);
      // Not ready yet: onReady above picks the click up.
      if (ytReadyRef.current) startYoutubeTrack();
      else armYoutubeWatchdog();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.currentTime = 0;
    setIsPlaying(true);
    setPlaybackError(null);
    void audio.play().catch(() => {
      setIsPlaying(false);
      setPlaybackError("Couldn't play this track. Please check your internet connection and try again.");
    });
  }

  function share() {
    const squares = guesses
      .map((guess) => (guess.correct ? "🟩" : guess.skipped ? "⬛" : "🟥"))
      .join("");
    const text = `Sargam ${won ? attemptsUsed || 1 : "X"}/${maxAttempts}\n${squares}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-(--scrim) p-4" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div
        className={`w-full max-w-md overflow-hidden rounded-[14px] border bg-(--surface-strong) shadow-2xl ${
          won ? "panel-in" : "miss-shake"
        }`}
        style={{
          borderColor: won
            ? "color-mix(in srgb, var(--success) 45%, var(--hairline))"
            : "color-mix(in srgb, var(--miss) 45%, var(--hairline))",
        }}
      >
        <div className="grid gap-6 p-5 sm:grid-cols-[132px_1fr] sm:p-6">
          <div className="mx-auto flex flex-col items-center sm:mx-0">
            {/* Hidden YouTube iframe — must be in the DOM for the IFrame API to attach */}
            {youtubeVideoId ? (
              <div
                aria-hidden="true"
                style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
              >
                <div ref={ytContainerRef} />
              </div>
            ) : null}
            <button
              type="button"
              onClick={togglePlayback}
              disabled={audioLoading || (!fullAudioUrl && !youtubeVideoId)}
              className={`relative flex h-32 w-32 items-center justify-center rounded-full bg-cover bg-center text-[#151925] shadow-lg transition-opacity duration-200 disabled:cursor-wait disabled:opacity-65 ${
                coverUrl
                  ? ""
                  : "border-[10px] border-[#111520] bg-[repeating-radial-gradient(circle,#2e3444_0_2px,#121620_3px_6px)]"
              }`}
              style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
              aria-label={isPlaying || cueing ? "Stop the full song" : "Play the full song"}
            >
              {coverUrl && <span className="absolute inset-0 rounded-full bg-black/35" aria-hidden="true" />}
              <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-(--signal) text-(--signal-ink)">
                {audioLoading || cueing ? (
                  <svg width="18" height="18" viewBox="0 0 20 20" className="animate-spin" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                    <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                ) : isPlaying ? (
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <rect x="4" y="3" width="4" height="14" rx="1" />
                    <rect x="12" y="3" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M5 3.5v13l11-6.5-11-6.5z" />
                  </svg>
                )}
              </span>
            </button>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
              {audioLoading
                ? "Loading full track"
                : cueing
                  ? "Cueing full track"
                  : playbackError
                    ? "Playback failed"
                    : isPlaying
                      ? "Stop full track"
                      : "Play full track"}
            </p>
          </div>

          <div className="relative min-w-0 text-center sm:text-left">
            {/* Ambient Status Glow */}
            <div
              className="absolute -inset-10 -z-10 pointer-events-none opacity-20 blur-3xl rounded-full"
              style={{
                background: won
                  ? "radial-gradient(circle, var(--success) 0%, transparent 70%)"
                  : "radial-gradient(circle, var(--miss) 0%, transparent 70%)",
              }}
            />

            <div className="mb-3.5 flex justify-center sm:justify-start">
              <span
                className="inline-flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 font-mono text-[9px] font-extrabold uppercase tracking-[0.16em] shadow-xs backdrop-blur-md transition-all"
                style={{
                  backgroundColor: won
                    ? "color-mix(in srgb, var(--success) 12%, transparent)"
                    : "color-mix(in srgb, var(--miss) 12%, transparent)",
                  color: won ? "var(--success)" : "var(--miss)",
                  border: `1px solid ${
                    won
                      ? "color-mix(in srgb, var(--success) 30%, transparent)"
                      : "color-mix(in srgb, var(--miss) 30%, transparent)"
                  }`,
                }}
              >
                {/* Circular Icon Wrapper */}
                <span
                  className="flex h-4.5 w-4.5 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: won
                      ? "color-mix(in srgb, var(--success) 20%, transparent)"
                      : "color-mix(in srgb, var(--miss) 20%, transparent)",
                  }}
                >
                  {won ? (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2.5 6 4.5 8 9.5 3" />
                    </svg>
                  ) : (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
                      <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
                    </svg>
                  )}
                </span>
                {won
                  ? attemptsUsed <= 1
                    ? "Nailed it — first try!"
                    : `Correct on attempt ${attemptsUsed}`
                  : "Not this time"}
              </span>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">
              {won ? "You guessed" : "The track was"}
            </p>
            <h2 id="result-title" className="mt-1 text-balance font-[family-name:var(--font-display)] text-3xl font-semibold leading-[0.95] tracking-[-0.02em] text-(--text)">
              {songTitle(reveal.title)}
            </h2>
            <p className="mt-2 font-[family-name:var(--font-display)] text-xs leading-4 text-(--text-dim)">
              {songSubtitleWithYear(reveal)}
            </p>
          </div>
        </div>

        {/* Full card width, not the disc column it belongs to: two sentences in
            a 132px gutter is eight lines of text and enough extra height to
            push the card off a short screen. */}
        {playbackError ? (
          <p
            role="alert"
            className="mx-5 mb-4 rounded-[6px] border px-3 py-2 text-[11px] leading-4 sm:mx-6 sm:mb-5"
            style={{
              borderColor: "color-mix(in srgb, var(--miss) 40%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--miss) 10%, transparent)",
              color: "var(--miss)",
            }}
          >
            {playbackError}
          </p>
        ) : null}

        <div className="grid grid-cols-3 border-y border-(--hairline) bg-(--surface)">
          <div className="border-r border-(--hairline) px-3 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Points</p>
            <p className="mt-1 font-semibold text-(--text)">{won && points !== null ? `+${points}` : "—"}</p>
          </div>
          <div className="border-r border-(--hairline) px-3 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Score</p>
            <p className="mt-1 font-semibold text-(--text)">{score.toLocaleString()}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Streak</p>
            <p className="mt-1 font-semibold text-(--text)">{streak}</p>
          </div>
        </div>

        {/* Lifetime rank and the badges nearest to unlocking. Rendered only
            once the run is over — see the `progression` prop. */}
        {progression ? (
          <div className="border-b border-(--hairline) bg-(--surface-strong) p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint)">Rank</span>
                <span className="text-xs font-bold text-(--signal)">{progression.rankName}</span>
              </div>
              <span className="font-mono text-[10px] text-(--text-dim)">
                Lv. {progression.level} •{" "}
                <strong className="font-semibold text-(--text)">{progression.xpProgress}</strong> /{" "}
                {progression.xpPerLevel} XP
              </span>
            </div>

            <div className="relative mb-4 h-2.5 w-full overflow-hidden rounded-full border border-(--hairline) bg-(--surface)">
              <div
                className="h-full rounded-full bg-gradient-to-r from-(--signal) to-orange-400 shadow-[0_0_8px_rgba(242,184,75,0.3)] transition-all duration-1000 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {spotlight.map((ach) => (
                <SpotlightBadge key={ach.id} entry={ach} />
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 p-4 sm:p-5">
          <button
            type="button"
            onClick={share}
            className="min-h-12 rounded-[7px] border border-(--hairline) bg-transparent px-3 text-sm font-semibold text-(--text-dim) transition-colors duration-200 hover:bg-(--surface-hover) hover:text-(--text)"
          >
            {copied ? "Result copied" : "Share result"}
          </button>
          <button
            type="button"
            onClick={onNext}
            autoFocus
            className="min-h-12 rounded-[7px] bg-(--signal) px-3 text-sm font-bold text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071]"
          >
            {nextLabel}
          </button>
        </div>
      </div>

      {/* After the card, so the pieces fall in FRONT of it. The panel root is
          fixed, so `absolute inset-0` inside Confetti spans the viewport. */}
      {won ? <Confetti accent="var(--signal)" /> : null}
    </div>
  );
}

/// Compact badge for the result panel. Shows the remaining distance on a locked
/// badge — the number is the whole point of a long threshold, and a bare grey
/// icon communicates nothing about how close it is.
function SpotlightBadge({ entry }: { entry: AchievementEntry }) {
  const label = entry.unlocked
    ? `${entry.name}: ${entry.desc} — unlocked`
    : `${entry.name}: ${entry.desc} — ${entry.progress.toLocaleString()} of ${entry.target.toLocaleString()}`;

  return (
    <div
      title={label}
      aria-label={label}
      className={`flex flex-col items-center justify-center rounded-[8px] border p-2 text-center transition-all duration-300 ${
        entry.unlocked
          ? `bg-gradient-to-b ${entry.color}`
          : "border-(--hairline) bg-transparent text-(--text-faint)"
      }`}
    >
      <span className={`mb-0.5 text-lg ${entry.unlocked ? "" : "opacity-30 grayscale"}`}>
        {entry.icon}
      </span>
      <span className="w-full truncate font-mono text-[9px] font-extrabold uppercase tracking-tight">
        {entry.name}
      </span>
      {entry.unlocked ? null : (
        <span className="mt-0.5 font-mono text-[8px] tabular-nums text-(--text-faint)">
          {entry.progress.toLocaleString()}/{entry.target.toLocaleString()}
        </span>
      )}
    </div>
  );
}

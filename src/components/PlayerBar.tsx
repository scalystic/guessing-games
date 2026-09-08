"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { waveformBars } from "@/lib/cover";

// Minimal type definitions for the YouTube IFrame Player API.
type YTPlayerInstance = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  destroy: () => void;
  getPlayerState: () => number;
  /// Media position in seconds. The stage clock is metered off this rather than
  /// off wall-clock time — see the playback-clock note below.
  getCurrentTime: () => number;
  /// 0..1 of the video buffered. Distinguishes "still downloading" from
  /// "stopped trying", which getPlayerState() cannot — see armYoutubeKick.
  getVideoLoadedFraction: () => number;
  /// Used by the priming play (see primeYoutubeRound), which is the only reason
  /// this deck ever mutes: a muted play is the API's only way to make an embed
  /// actually BUFFER, and it is exempt from autoplay blocking.
  mute: () => void;
  unMute: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
          };
        },
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Props = {
  audioUrl: string | null;
  /// When set, play from YouTube instead of a stored audio clip.
  youtubeVideoId?: string | null;
  /// Millisecond offset in the YouTube video where the hook starts.
  hookStartMs?: number;
  revealMs: number;
  totalMs: number;
  ladder: number[];
  loading: boolean;
  waveformSeed: string;
  onPlayRequested?: () => void;
  promptTitle?: string;
  promptSubtitle?: string;
  /// Bump to start the clip without a click. See the effect that consumes it.
  autoPlayToken?: number;
};

const BAR_COUNT = 32;
const FADE_OUT_MS = 15;

/// YT.PlayerState, inlined rather than read off window.YT so the state handler
/// does not depend on the API object having finished loading.
const YT_ENDED = 0;
const YT_PLAYING = 1;

/// How long to wait for a play() to actually produce audio before giving up.
/// Reaching this means the video never started — embed disabled, region block,
/// a dead network — and the deck would otherwise sit on "On air" in silence
/// forever, since the clock only advances on real playback.
const YT_START_TIMEOUT_MS = 8_000;

/// How long to let a play command sit before pressing play again on the
/// player's behalf, and how many times to do it. See armYoutubeKick.
const YT_KICK_INTERVAL_MS = 900;
const YT_KICK_ATTEMPTS = 3;

/// How long the muted priming play is allowed to run before the player is
/// parked back on the hook. See primeYoutubeRound.
///
/// It only has to last long enough for the asynchronous seek to LAND and the
/// buffer to start filling — the download continues while the player is paused,
/// so this is a head start, not the whole fetch. Long enough to cover a slow
/// seek, short enough that a player who clicks immediately barely overlaps it.
const YT_PRIME_PLAY_MS = 1_200;

/// A playhead this much BEHIND the current zero point means a pending seek has
/// only just landed, and the zero taken before it belonged to the position the
/// player was leaving. Loose enough to ignore the jitter of a normal reading.
const YT_REZERO_SEC = 0.05;

/// With less than this much of the window left, hand the ending to a timeout: a
/// frame boundary is 16ms of slop out of a 400ms stage 1.
const YT_END_ARM_MS = 60;

/// No playhead movement for this long, with a clip in flight, is a stall.
const YT_STALL_GRACE_MS = 180;

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  const value = seconds < 1 ? seconds.toFixed(1) : Number.isInteger(seconds) ? seconds : seconds.toFixed(1);
  return `${value} sec`;
}

// Load YouTube IFrame API once globally.
let ytApiLoaded = false;
let ytApiReady = false;
const ytReadyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(onReady: () => void): void {
  if (ytApiReady) { onReady(); return; }
  ytReadyCallbacks.push(onReady);
  if (ytApiLoaded) return;
  ytApiLoaded = true;

  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    ytApiReady = true;
    for (const cb of ytReadyCallbacks) cb();
    ytReadyCallbacks.length = 0;
  };

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

export function PlayerBar({
  audioUrl,
  youtubeVideoId,
  hookStartMs = 0,
  revealMs,
  totalMs,
  ladder,
  loading,
  waveformSeed,
  onPlayRequested,
  promptTitle,
  promptSubtitle,
  autoPlayToken = 0,
}: Props) {
  // Stored-audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef(0);

  // YouTube refs
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const ytEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytVideoIdRef = useRef<string | null>(null);
  /// Paired with ytVideoIdRef so a not-yet-ready player can still land on the
  /// right offset once onReady fires, even if the round changed again first.
  const ytHookStartMsRef = useRef(0);

  /**
   * Playback clock for the YouTube path.
   *
   * The stage window must be measured in AUDIBLE time, not wall-clock time.
   * `playVideo()` is asynchronous — it returns immediately and the player then
   * seeks and buffers — so starting a `setTimeout(revealMs)` next to the call
   * runs the clock while the deck is still silent. At stage 1 the window is
   * 400ms and a cold start is easily longer than that, which is the whole of
   * the "first play was silent, the second one worked" bug: the first play spent
   * its entire window buffering and was paused again before a sample reached
   * the speakers, and the second only worked because the first had left the
   * region buffered.
   *
   * PLAYING is not "audible" either — a cold player raises it while it is still
   * fetching and decoding at the seek target — so the clock cannot be driven off
   * the state machine alone.
   *
   * So the clock is metered off the PLAYHEAD. Media time elapsed since the seek
   * target IS the audible duration: a stall does not advance it, a resume picks
   * it straight back up, and there is no wall-clock bookkeeping to keep in sync.
   * `youtubeTick` samples it every frame; the window is only allowed to start
   * once the playhead is observed actually moving.
   *
   * The stored-audio path does not need any of this: its element is preloaded,
   * so play() is audible on the next tick and wall-clock is a fair proxy.
   */
  /// True from the click until the clip is finished or abandoned — the guard that
  /// keeps onStateChange from acting on state changes we did not ask for (the
  /// PAUSED that our own end-of-window pauseVideo() raises, and every state the
  /// muted priming play below raises, most of all).
  const ytPendingPlayRef = useRef(false);
  /// Media position this clip's audible time is measured from, or null before
  /// playback has been observed. Set from the playhead itself, never from the
  /// offset we asked for — see youtubeTick.
  const ytZeroRef = useRef<number | null>(null);
  /// Last sampled playhead. A single sample proves nothing; two consecutive
  /// samples a playback-sized step apart are what prove audio is playing.
  const ytLastPlayheadRef = useRef<number | null>(null);
  /// performance.now() of that sample, so the step can be judged against the
  /// wall-clock gap it covers.
  const ytLastSampleAtRef = useRef(0);
  /// performance.now() of the last observed playhead advance, for stall detection.
  const ytLastAdvanceAtRef = useRef(0);
  /// Audio has been observed flowing for the clip in flight.
  const ytAudibleRef = useRef(false);
  const ytStartWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytKickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytKickAttemptsRef = useRef(0);
  /// Loaded fraction at the previous kick check, to tell a download that is
  /// progressing from a player that has given up.
  const ytLoadedFractionRef = useRef<number | null>(null);
  /// Video id that has been handed to loadVideoById, i.e. one this player has
  /// actually started rather than merely been cued with.
  const ytLoadedIdRef = useRef<string | null>(null);
  /// Video id the priming play has already been run for, so a re-render or a
  /// hookStartMs echo cannot prime the same round twice.
  const ytPrimedIdRef = useRef<string | null>(null);
  const ytPrimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /// revealMs as of the latest commit. onStateChange is registered once, when the
  /// player is constructed, so reading the prop directly would pin the handler to
  /// whichever stage happened to be on screen for the first round of the run.
  /// Same hazard, and the same fix, as ytVideoIdRef above.
  const revealMsRef = useRef(revealMs);

  const [isPlaying, setIsPlaying] = useState(false);
  /// Play was pressed but no audio has reached the speakers yet. The deck says
  /// "Cueing" rather than "On air" for this stretch, because claiming to be on
  /// air over silence is exactly what made the first play look broken.
  const [awaitingAudio, setAwaitingAudio] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const [vuLevels, setVuLevels] = useState([0, 0]);

  useEffect(() => { revealMsRef.current = revealMs; }, [revealMs]);

  useEffect(() => {
    // Not while cueing: needles bouncing over silence is the same lie as "On air".
    if (!isPlaying || awaitingAudio) return;
    const interval = setInterval(() => {
      setVuLevels([Math.floor(Math.random() * 8) + 1, Math.floor(Math.random() * 8) + 1]);
    }, 100);
    return () => { clearInterval(interval); setVuLevels([0, 0]); };
  }, [isPlaying, awaitingAudio]);

  // Stored-audio element lifecycle
  useEffect(() => {
    if (!audioUrl) { audioRef.current = null; return; }
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => { audio.pause(); audioRef.current = null; };
  }, [audioUrl]);

  // YouTube player lifecycle — create/reuse player when youtubeVideoId changes
  useEffect(() => {
    if (!youtubeVideoId) return;

    let cancelled = false;
    const targetVideoId = youtubeVideoId;
    ytVideoIdRef.current = targetVideoId;
    ytHookStartMsRef.current = hookStartMs;

    loadYouTubeAPI(() => {
      if (cancelled || !ytContainerRef.current || !window.YT) return;

      if (ytPlayerRef.current) {
        // A player already exists for an earlier round. If it's finished
        // initializing, land it on the latest target now. If not — its own
        // `onReady` (below) hasn't fired yet, and the object it returned is a
        // stub without real methods attached; calling pauseVideo/cueVideoById
        // on it throws. onReady re-syncs to ytVideoIdRef/ytHookStartMsRef once
        // it does fire, so the target set just above is never lost.
        if (ytReadyRef.current) {
          // Stop the previous round's clip if it was still running. The LOAD of
          // the new target is left to the priming effect below, which has to
          // run after the round-change reset — and which loads rather than
          // cues, so a cueVideoById here would be immediately superseded work.
          // Dropping it also removes the pause-on-top-of-a-cue sequence this
          // file documents as a way to wedge the embed.
          ytPlayerRef.current.pauseVideo();
        }
        return;
      }

      // First time — create the player.
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: targetVideoId,
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
            // Prime the round the moment the player is usable.
            //
            // The priming effect below cannot do it for the FIRST round: it and
            // this constructor both wait on loadYouTubeAPI, the constructor's
            // callback is queued first, and when it runs the player it creates
            // is not ready yet — so the effect's own call bails on
            // !ytReadyRef.current. This is the point where readiness is known.
            //
            // It also subsumes the re-sync that used to live here (cueVideoById
            // onto whatever the current target is, in case the round advanced
            // while the player was still loading): priming loads that same
            // target, and loads it properly rather than merely cueing it.
            //
            // Safe to capture this render's primeYoutubeRound — it touches only
            // refs and its arguments, per the note above clearYoutubeWatchdog().
            const currentId = ytVideoIdRef.current;
            if (currentId) primeYoutubeRound(currentId, ytHookStartMsRef.current / 1000);
          },
          onStateChange: (event) => {
            // Not a clip the player asked for: cueing a round, our own
            // end-of-window pause, an admin scrub. None are theirs.
            if (!ytPendingPlayRef.current) return;

            if (event.data === YT_ENDED) {
              // The hook sat close enough to the end of the video that the track
              // ran out before the window did. Nothing left to hear.
              finishYoutubeClip();
              return;
            }

            // PLAYING, BUFFERING and PAUSED need no bookkeeping of their own:
            // the clock reads the playhead (youtubeTick), so a stall simply
            // stops advancing it and a resume picks it back up. Restarting the
            // frame loop here is belt-and-braces for a PLAYING that arrives
            // after the loop has bailed out.
            if (event.data === YT_PLAYING && rafRef.current === null) {
              rafRef.current = requestAnimationFrame(youtubeTick);
            }
          },
        },
      });
    });

    return () => { cancelled = true; };
  // The clock helpers used by onStateChange are deliberately NOT dependencies.
  // They are redefined every render, so listing them would tear down and rebuild
  // the player constantly — and the handler is registered once with the player
  // anyway, so a newer copy could never reach it. They read their inputs from
  // refs precisely so that capturing the first one is safe; see the note above
  // clearYoutubeWatchdog().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideoId, hookStartMs]);

  // Destroy YouTube player on unmount
  useEffect(() => {
    return () => {
      if (ytEndTimerRef.current) clearTimeout(ytEndTimerRef.current);
      if (ytStartWatchdogRef.current) clearTimeout(ytStartWatchdogRef.current);
      if (ytKickTimerRef.current) clearTimeout(ytKickTimerRef.current);
      if (ytPrimeTimerRef.current) clearTimeout(ytPrimeTimerRef.current);
      if (ytPlayerRef.current) { ytPlayerRef.current.destroy(); ytPlayerRef.current = null; }
    };
  }, []);

  function stopPlayback() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.volume = 1; }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    rafRef.current = null;
    fadeTimeoutRef.current = null;
  }

  /**
   * The YouTube clock helpers below are captured by the onStateChange closure
   * when the player is constructed, and that closure is never re-registered.
   * They must therefore touch ONLY refs and the (stable) state setters — reading
   * a prop or a state value here would silently freeze it at the first round of
   * the run. revealMsRef exists for exactly this reason; anything else added
   * later needs the same treatment.
   */

  function clearYoutubeWatchdog() {
    if (ytStartWatchdogRef.current) clearTimeout(ytStartWatchdogRef.current);
    ytStartWatchdogRef.current = null;
  }

  function clearYoutubeEndTimer() {
    if (ytEndTimerRef.current) clearTimeout(ytEndTimerRef.current);
    ytEndTimerRef.current = null;
  }

  function stopYoutubeFrameLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  /// Give up on a clip that is waiting for audio that never comes. Armed on the
  /// initial play AND on every mid-clip stall, because gating the clock on real
  /// playback means a stall that never resolves would otherwise leave the deck
  /// frozen on "Cueing" indefinitely — a wall-clock timer always fired, so this
  /// is the one failure mode the fix has to hand back.
  ///
  /// Whatever was genuinely heard stays on the progress bar; the player is not
  /// credited for the part that never played.
  function armYoutubeWatchdog() {
    clearYoutubeWatchdog();
    ytStartWatchdogRef.current = setTimeout(() => {
      ytStartWatchdogRef.current = null;
      if (!ytPendingPlayRef.current) return;
      const heard = Math.min(revealMsRef.current, youtubeAudibleMs());
      stopYoutubePlayback();
      if (ytReadyRef.current) ytPlayerRef.current?.pauseVideo();
      setIsPlaying(false);
      setProgressMs(heard);
    }, YT_START_TIMEOUT_MS);
  }

  function readYoutubePlayhead(): number | null {
    const player = ytPlayerRef.current;
    if (!player || !ytReadyRef.current) return null;
    try {
      const seconds = player.getCurrentTime();
      return Number.isFinite(seconds) ? seconds : null;
    } catch {
      return null;
    }
  }

  /// Audible ms of the clip in flight, read straight off the playhead.
  function youtubeAudibleMs(): number {
    const zero = ytZeroRef.current;
    const playhead = readYoutubePlayhead();
    if (zero === null || playhead === null) return 0;
    return Math.max(0, (playhead - zero) * 1000);
  }

  function armYoutubeEndTimer(remainingMs: number) {
    clearYoutubeEndTimer();
    ytEndTimerRef.current = setTimeout(finishYoutubeClip, Math.max(0, remainingMs));
  }

  /// One frame loop owns the whole clip: it decides when audio has genuinely
  /// started, paints the progress bar off the playhead, and hands the last few
  /// milliseconds to a timeout so the window does not end on a frame boundary
  /// (16ms of slop out of a 400ms stage 1).
  function youtubeTick() {
    rafRef.current = null;
    if (!ytPendingPlayRef.current) return;

    const windowMs = revealMsRef.current;
    const playhead = readYoutubePlayhead();
    const now = performance.now();

    // Zero point: the media position where THIS clip's audio was first observed
    // moving — deliberately not the offset we asked for.
    //
    // seekTo/loadVideoById are asynchronous, and until one lands getCurrentTime
    // keeps reporting the position the player was already parked at. Measuring
    // against the requested offset therefore mismeasures every replay: the deck
    // sits at the END of the last clip, which is already a full window past the
    // hook, so the very first frame computed "window spent" and paused the video
    // 15ms after the click — the press that appeared to do nothing at all.
    //
    // Movement is the one signal that cannot lie: the playhead only advances
    // when audio is genuinely playing.
    if (playhead !== null) {
      const previous = ytLastPlayheadRef.current;
      const previousAt = ytLastSampleAtRef.current;
      ytLastPlayheadRef.current = playhead;
      ytLastSampleAtRef.current = now;

      // Playing advances media time at roughly wall-clock rate, so a step much
      // larger than the gap between samples is a SEEK, not playback — the
      // difference between "the video moved 16ms further into the song" and
      // "the video jumped from 0 to the hook at 11.6s". Counting the second as
      // playback is what made a clip end the instant it was asked to start.
      const delta = previous === null ? null : playhead - previous;
      const maxStepSec = ((now - previousAt) * 1.5) / 1000 + 0.05;

      if (delta !== null && (delta < -YT_REZERO_SEC || delta > maxStepSec)) {
        // A pending seek has just landed. Anything measured up to here belonged
        // to the position the player was leaving.
        if (ytZeroRef.current !== null || ytAudibleRef.current) {
          ytZeroRef.current = null;
          ytAudibleRef.current = false;
          setAwaitingAudio(true);
        }
      } else if (delta !== null && delta > 0) {
        ytLastAdvanceAtRef.current = now;
        // Zero on the sample movement started from, once per clip.
        if (ytZeroRef.current === null) ytZeroRef.current = previous;
        if (!ytAudibleRef.current) {
          // Audio is flowing — either it just started or it came back from a
          // stall. Either way the window is allowed to run again.
          ytAudibleRef.current = true;
          clearYoutubeWatchdog();
          clearYoutubeKick();
          setAwaitingAudio(false);
        }
      }
    }

    if (ytAudibleRef.current && now - ytLastAdvanceAtRef.current > YT_STALL_GRACE_MS) {
      // Stalled mid-clip. Drop the end timer and put the watchdog back; the
      // playhead is the ledger, so time not heard is simply never counted.
      ytAudibleRef.current = false;
      clearYoutubeEndTimer();
      armYoutubeWatchdog();
      setAwaitingAudio(true);
    }

    const zero = ytZeroRef.current;
    const elapsed = zero !== null && playhead !== null ? Math.max(0, (playhead - zero) * 1000) : 0;
    if (elapsed >= windowMs) { finishYoutubeClip(); return; }
    setProgressMs(elapsed);

    if (ytAudibleRef.current && windowMs - elapsed <= YT_END_ARM_MS) {
      armYoutubeEndTimer(windowMs - elapsed);
    }

    rafRef.current = requestAnimationFrame(youtubeTick);
  }

  /// The window is spent. Clearing the pending flag BEFORE pausing matters: the
  /// pause raises its own onStateChange, and the handler must ignore it rather
  /// than treat it as part of the clip.
  function finishYoutubeClip() {
    ytPendingPlayRef.current = false;
    ytAudibleRef.current = false;
    clearYoutubeEndTimer();
    clearYoutubeWatchdog();
    clearYoutubeKick();
    stopYoutubeFrameLoop();
    if (ytReadyRef.current) ytPlayerRef.current?.pauseVideo();
    setIsPlaying(false);
    setAwaitingAudio(false);
    setProgressMs(revealMsRef.current);
  }

  function stopYoutubePlayback() {
    ytPendingPlayRef.current = false;
    ytAudibleRef.current = false;
    ytZeroRef.current = null;
    ytLastPlayheadRef.current = null;
    clearYoutubeEndTimer();
    clearYoutubeWatchdog();
    clearYoutubeKick();
    // A pending prime must never park (pause + seek) a player that is about to
    // start, or has just started, a real clip. Every caller of this — a round
    // change, the watchdog, and handleYoutubePlay on its way in — wants any
    // in-flight priming abandoned.
    clearYoutubePrimeTimer();
    stopYoutubeFrameLoop();
    setAwaitingAudio(false);
  }

  function youtubeLoadedFraction(): number | null {
    const player = ytPlayerRef.current;
    if (!player || !ytReadyRef.current) return null;
    try {
      const loaded = player.getVideoLoadedFraction();
      return Number.isFinite(loaded) ? loaded : null;
    } catch {
      return null;
    }
  }

  /// Start the clip.
  ///
  /// The FIRST play of a round goes through `loadVideoById`, not
  /// `seekTo` + `playVideo`. A player that has only ever been cued (which is all
  /// the constructor and `cueVideoById` do) routinely swallows that pair — the
  /// seek re-cues the video and the play command lands on a player that is
  /// busy loading, so nothing happens at all until the player presses the button
  /// a second time. `loadVideoById({videoId, startSeconds})` is the API's own
  /// load-and-play primitive and has no such gap.
  ///
  /// Replays inside the same round keep using seek + play: by then the video is
  /// loaded, and re-loading it would throw away the buffer and make every replay
  /// as slow as the first.
  function startYoutubePlayback(player: YTPlayerInstance, targetSeconds: number) {
    const videoId = ytVideoIdRef.current;
    try {
      if (videoId && ytLoadedIdRef.current !== videoId) {
        ytLoadedIdRef.current = videoId;
        player.loadVideoById({ videoId, startSeconds: targetSeconds });
        return;
      }
      player.seekTo(targetSeconds, true);
      player.playVideo();
    } catch {
      // The player object exists but isn't usable — the watchdog ends the clip.
    }
  }

  /// Press play again on the player's behalf if the command never took.
  ///
  /// A cold embed drops play commands: cueing a round and then pressing play
  /// leaves it reporting BUFFERING indefinitely, and the deck sits in Cueing
  /// until a second press — which is the entire "first click does nothing,
  /// second click works" bug. Rather than make the player press twice, press
  /// again here.
  ///
  /// Deliberately NOT conditioned on getPlayerState(): the stuck case reports
  /// BUFFERING the whole time, so trusting the state machine is what made an
  /// earlier version of this never fire. The playhead is the only honest signal,
  /// and `ytAudibleRef` is that signal — once audio is genuinely flowing, the
  /// tick clears the kick and nothing further is sent.
  function armYoutubeKick(targetSeconds: number) {
    clearYoutubeKick();
    ytKickAttemptsRef.current = 0;
    ytLoadedFractionRef.current = youtubeLoadedFraction();

    const kick = () => {
      ytKickTimerRef.current = null;
      if (!ytPendingPlayRef.current || ytAudibleRef.current) return;

      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current) return;

      // Is the embed actually fetching, or wedged? getPlayerState() cannot tell
      // the two apart — it reports BUFFERING for both — but the loaded fraction
      // can: it climbs while the video is downloading and sits still when the
      // player has stopped trying. Re-seeking a download that IS progressing
      // just restarts it, which turns a slow start into no start at all.
      const loaded = youtubeLoadedFraction();
      const previous = ytLoadedFractionRef.current;
      ytLoadedFractionRef.current = loaded;
      const fetching = loaded !== null && previous !== null && loaded > previous;

      if (!fetching) {
        try {
          player.seekTo(targetSeconds, true);
          player.playVideo();
        } catch {
          // Same as above: let the watchdog end it.
        }
      }

      ytKickAttemptsRef.current += 1;
      if (ytKickAttemptsRef.current < YT_KICK_ATTEMPTS) {
        ytKickTimerRef.current = setTimeout(kick, YT_KICK_INTERVAL_MS);
      }
    };

    ytKickTimerRef.current = setTimeout(kick, YT_KICK_INTERVAL_MS);
  }

  function clearYoutubeKick() {
    if (ytKickTimerRef.current) clearTimeout(ytKickTimerRef.current);
    ytKickTimerRef.current = null;
  }

  function clearYoutubePrimeTimer() {
    if (ytPrimeTimerRef.current) clearTimeout(ytPrimeTimerRef.current);
    ytPrimeTimerRef.current = null;
  }

  /**
   * Buffer the round's clip BEFORE the player clicks, so the click is instant.
   *
   * THE PROBLEM THIS EXISTS TO FIX. Opening a round only ever CUED the player
   * (the lifecycle effect above, and the constructor). cueVideoById loads
   * metadata and deliberately no media — a cued player holds zero bytes of the
   * hook. So the first click of every round paid for a full cold start: fetch
   * the player response, land an asynchronous seek some way into the track, then
   * fill the buffer. The deck reports "Cueing" for exactly that stretch, because
   * the clock is metered off the playhead and the playhead has not moved yet.
   * The readout was honest; the wait was the bug.
   *
   * WHY IT HAS TO BE A PLAY. The IFrame API offers no prefetch. Cueing is the
   * closest thing and it is precisely the no-op described above, so the only way
   * to make an embed genuinely download is to play it. Muted, because muted
   * playback is exempt from browser autoplay blocking — which is the only reason
   * this may run without a user gesture at all.
   *
   * Nothing here is ever audible: mute() precedes the load, and unMute() happens
   * only once the player has been paused again. The download continues while
   * paused, so YT_PRIME_PLAY_MS is a head start rather than the whole fetch.
   *
   * Every state this raises is ignored by onStateChange, which bails unless
   * ytPendingPlayRef is set — and priming never sets it.
   */
  function primeYoutubeRound(videoId: string, targetSeconds: number) {
    const player = ytPlayerRef.current;
    if (!player || !ytReadyRef.current) return;
    // The player clicked before priming got its chance. That play is already
    // doing this work itself, and touching the player now would fight it.
    if (ytPendingPlayRef.current) return;
    if (ytPrimedIdRef.current === videoId) return;
    ytPrimedIdRef.current = videoId;

    try {
      player.mute();
      // loadVideoById rather than cueVideoById — cueing is the very thing this
      // works around. Recording it as loaded also routes the player's real
      // click down startYoutubePlayback's seek+play path instead of a second
      // full load, which would throw away the buffer just warmed here.
      ytLoadedIdRef.current = videoId;
      player.loadVideoById({ videoId, startSeconds: targetSeconds });
    } catch {
      // Player object exists but isn't usable yet; let the real click load it.
      ytPrimedIdRef.current = null;
      ytLoadedIdRef.current = null;
      return;
    }

    clearYoutubePrimeTimer();
    ytPrimeTimerRef.current = setTimeout(() => {
      ytPrimeTimerRef.current = null;
      const parked = ytPlayerRef.current;
      if (!parked || !ytReadyRef.current) return;
      try {
        // Belt-and-braces: handleYoutubePlay cancels this timer before it
        // starts a real clip, so this should be unreachable. If it ever did
        // race through, pausing would kill the exact click priming exists to
        // serve — so unmute and get out of the way instead.
        if (ytPendingPlayRef.current) {
          parked.unMute();
          return;
        }
        parked.pauseVideo();
        parked.seekTo(targetSeconds, true);
        parked.unMute();
      } catch {
        /* player went away; the next play re-loads from scratch */
      }
    }, YT_PRIME_PLAY_MS);
  }

  useEffect(() => stopPlayback, []);

  useEffect(() => { stopPlayback(); }, [audioUrl]);

  /// Round change: drop the clip state that belonged to the previous video.
  ///
  /// No pauseVideo() here. The lifecycle effect above already paused and re-cued
  /// the player for the new round, and this effect runs immediately after it —
  /// a second pause lands ON TOP of that cue and leaves the embed wedged, so the
  /// next play command is swallowed and the deck waits out its watchdog. That
  /// was the round-change half of "the first click does nothing".
  useEffect(() => {
    stopYoutubePlayback();
    if (isPlaying) setIsPlaying(false);
    if (progressMs !== 0) setProgressMs(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideoId]);

  /// Warm the new round's clip. Declared AFTER the reset effect above so it runs
  /// after it in the same commit — priming before that reset would have its
  /// loadVideoById undone by the stopYoutubePlayback that follows.
  ///
  /// The game always has runway here: the round opens (and the reveal panel
  /// before it sits for RESULTS_DELAY_MS) while the player is still reading the
  /// board, so the buffer is warm well before the click.
  useEffect(() => {
    if (!youtubeVideoId) return;
    const videoId = youtubeVideoId;
    const targetSeconds = hookStartMs / 1000;

    let cancelled = false;
    // The player may not exist yet on the very first round — the API script and
    // the constructor are both async. loadYouTubeAPI fires immediately once
    // ready, and onReady has already re-synced the target by then.
    loadYouTubeAPI(() => {
      if (cancelled || ytVideoIdRef.current !== videoId) return;
      primeYoutubeRound(videoId, targetSeconds);
    });

    return () => {
      cancelled = true;
      clearYoutubePrimeTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideoId, hookStartMs]);

  /// Start the clip on the parent's say-so, no click.
  ///
  /// A skip's entire purpose is the longer window it buys, so ending it with the
  /// deck sitting on "Ready" makes the player press play for the thing they just
  /// asked for. The parent bumps the token once the new stage has been committed
  /// to state, which is why this reads `revealMs` correctly: the bump is batched
  /// with the stage change, so by the time this effect runs the window on screen
  /// is already the one that was just unlocked.
  ///
  /// A COUNTER, not a boolean: two skips in a row are two distinct requests and
  /// each has to fire, and the initial value can then be ignored so mounting the
  /// deck never plays anything by itself.
  ///
  /// Declared last on purpose. The round-change reset and the stored-audio
  /// teardown above both call stopPlayback/stopYoutubePlayback in the same
  /// commit; starting playback before them would have it torn straight back down.
  const autoPlayTokenRef = useRef(autoPlayToken);
  useEffect(() => {
    if (autoPlayToken === autoPlayTokenRef.current) return;
    autoPlayTokenRef.current = autoPlayToken;

    // `onPlayRequested` means the button isn't a play button at all (the era
    // picker borrows the deck), and `loading` means there is nothing to play yet.
    if (onPlayRequested || loading) return;

    if (youtubeVideoId) handleYoutubePlay();
    else if (audioUrl) handlePlay();
  // Only the token drives this. Listing audioUrl/revealMs would restart the clip
  // in the middle of a listen every time the stage moved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayToken]);

  const [lastUrl, setLastUrl] = useState(audioUrl);
  if (lastUrl !== audioUrl) {
    setLastUrl(audioUrl);
    if (isPlaying) setIsPlaying(false);
    if (progressMs !== 0) setProgressMs(0);
  }

  function tick() {
    const elapsed = performance.now() - playStartRef.current;
    if (elapsed >= revealMs) {
      setProgressMs(revealMs);
      setIsPlaying(false);
      return;
    }
    setProgressMs(elapsed);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    stopPlayback();
    playStartRef.current = performance.now();
    setIsPlaying(true);
    setProgressMs(0);
    rafRef.current = requestAnimationFrame(tick);

    audio.currentTime = 0;
    audio.volume = 1;
    void audio.play().catch(() => setIsPlaying(false));

    const fadeStart = Math.max(0, revealMs - FADE_OUT_MS);
    fadeTimeoutRef.current = setTimeout(() => {
      const steps = 5;
      for (let step = 1; step <= steps; step++) {
        setTimeout(() => {
          if (!audioRef.current) return;
          audioRef.current.volume = Math.max(0, 1 - step / steps);
        }, (FADE_OUT_MS / steps) * step);
      }
    }, fadeStart);
  }

  function handleStop() {
    stopPlayback();
    setIsPlaying(false);
  }

  function handleYoutubePlay() {
    const player = ytPlayerRef.current;
    if (!player || !ytReadyRef.current) return;

    // Also cancels any in-flight priming, so it cannot park this clip.
    stopYoutubePlayback();

    // MUST come before the play. If the click lands inside the prime window the
    // player is still muted, and the clock is metered off the playhead — which
    // advances just the same when muted. The whole stage window would be spent
    // in silence and scored as heard. Unconditional rather than conditioned on
    // "did we prime": unmuting an unmuted player is free, and guessing wrong
    // here costs the player their attempt.
    try {
      player.unMute();
    } catch {
      /* unusable player; the watchdog ends the clip */
    }

    const targetSeconds = hookStartMs / 1000;
    ytPendingPlayRef.current = true;
    ytZeroRef.current = null;
    ytLastPlayheadRef.current = null;
    ytLastSampleAtRef.current = performance.now();
    ytLastAdvanceAtRef.current = performance.now();

    // isPlaying flips now so the button becomes a stop and the click is
    // acknowledged, but the CLOCK does not start here — youtubeTick starts it
    // when the playhead proves audio is flowing. Until then the progress bar
    // sits at 0, which is the honest reading: nothing has been heard yet.
    setIsPlaying(true);
    setProgressMs(0);
    setAwaitingAudio(true);

    startYoutubePlayback(player, targetSeconds);

    armYoutubeWatchdog();
    armYoutubeKick(targetSeconds);
    stopYoutubeFrameLoop();
    rafRef.current = requestAnimationFrame(youtubeTick);
  }

  function handleYoutubeStop() {
    stopYoutubePlayback();
    if (ytReadyRef.current) ytPlayerRef.current?.pauseVideo();
    setIsPlaying(false);
  }

  const isYoutube = Boolean(youtubeVideoId);
  const playedPct = totalMs > 0 ? Math.min(100, (progressMs / totalMs) * 100) : 0;
  const bars = useMemo(() => waveformBars(waveformSeed, BAR_COUNT), [waveformSeed]);

  const disabled = onPlayRequested
    ? loading
    : loading || (!audioUrl && !isYoutube);

  const playHandler = onPlayRequested
    ?? (isYoutube
      ? (isPlaying ? handleYoutubeStop : handleYoutubePlay)
      : (isPlaying ? handleStop : handlePlay));

  return (
    <section className="signal-deck rounded-[18px] p-4 text-[#f2e9d8] sm:p-6" aria-label="Mystery audio deck">
      {/* Hidden YouTube iframe — must be in the DOM for the IFrame API to attach */}
      {isYoutube && (
        <div
          aria-hidden="true"
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
        >
          <div ref={ytContainerRef} />
        </div>
      )}

      <div className="flex items-start justify-between gap-4 border-b border-[#343b51] pb-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8e93a3]">
            Clip window
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold leading-none tracking-[-0.02em] text-[#f2e9d8] sm:text-3xl">
            {formatDuration(revealMs)}
          </p>
        </div>
        <div className="border border-[#394056] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a8adba] flex items-center gap-1.5 rounded-[4px]">
          {isPlaying && !awaitingAudio && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff4d4d] animate-pulse shadow-[0_0_6px_#ff4d4d]" />
          )}
          {!isPlaying && !loading && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#525a70]" />
          )}
          {(loading || (isPlaying && awaitingAudio)) && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#f2b84b] animate-ping" />
          )}
          <span>
            {loading ? "Tuning" : isPlaying ? (awaitingAudio ? "Cueing" : "On air") : "Ready"}
          </span>
        </div>
      </div>

      <div className="relative mt-5 p-4 rounded-[12px] bg-[#10131e] border border-[#2d3447] shadow-inner overflow-hidden">
        <div className="absolute inset-2 bg-gradient-to-b from-[#2c3347] to-[#1a1e2b] rounded-[8px] border border-[#3e4761] shadow-md z-0 opacity-90" />
        <div className="absolute top-1/2 -translate-y-1/2 left-2 right-2 h-10 bg-gradient-to-r from-[#d99d2f]/10 via-[#3a7ad5]/15 to-[#d99d2f]/10 border-t border-b border-[#3e4761]/30 z-0 pointer-events-none" />
        <div className="relative z-10 grid grid-cols-[42px_1fr_42px] items-center gap-3 rounded-[6px] bg-[#07090f] border border-[#1b1f2d] shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] px-3 py-4 sm:grid-cols-[56px_1fr_56px] sm:gap-5 sm:px-5 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-transparent via-white/[0.015] to-white/[0.05] z-20" />
          <div className="absolute top-1 left-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />
          <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />
          <div className="absolute bottom-1 left-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />
          <div className="absolute bottom-1 right-1 w-1 h-1 rounded-full bg-[#11141c] border border-[#252b3b]" />
          <div className="absolute bottom-1.5 left-6 right-6 h-[4px] bg-[#22170d] border-t border-[#3d2c1c] opacity-90 z-0" />
          <div className="absolute top-1 left-1/2 -translate-x-1/2 font-mono text-[7px] tracking-[0.25em] text-[#5b647d] uppercase select-none pointer-events-none z-10">
            SARGAM CH-1 • C90
          </div>
          <span className="cassette-reel relative aspect-square rounded-full z-10" data-playing={isPlaying} aria-hidden="true" />
          <div className="relative flex h-10 items-center gap-0.5 overflow-hidden z-10" aria-hidden="true">
            {bars.map((height, index) => {
              const barPct = (index / BAR_COUNT) * 100;
              return (
                <span
                  key={index}
                  className="min-h-1 flex-1 bg-[#1e2333] transition-colors duration-150"
                  style={{
                    height: `${height.toFixed(2)}%`,
                    background: barPct <= playedPct ? "var(--signal)" : undefined,
                  }}
                />
              );
            })}
          </div>
          <span className="cassette-reel relative aspect-square rounded-full z-10" data-playing={isPlaying} aria-hidden="true" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 border-t border-[#2d3447] pt-5">
        <button
          type="button"
          onClick={playHandler}
          disabled={disabled}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-(--signal) text-(--signal-ink) transition-colors duration-200 hover:bg-[#ffd071] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={
            onPlayRequested
              ? "Choose an era to start"
              : isPlaying
                ? "Stop the clip"
                : `Play the ${formatDuration(revealMs)} clip`
          }
        >
          {loading ? (
            <svg width="20" height="20" viewBox="0 0 20 20" className="animate-spin" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
              <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <rect x="4" y="3" width="4" height="14" rx="1" />
              <rect x="12" y="3" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M5 3.5v13l11-6.5-11-6.5z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#f2e9d8]">
            {loading
              ? "Tuning the next signal…"
              : isPlaying
                ? awaitingAudio
                  ? "Cueing the clip…"
                  : "Listen closely"
                : (promptTitle ?? "Think you know it?")}
          </p>
          <p className="mt-1 text-xs text-[#8e93a3]">
            {promptSubtitle ?? "Replay as often as you need. A miss unlocks more."}
          </p>
        </div>

        <div className="flex flex-col gap-1 bg-[#0b0d14] p-2 rounded border border-[#242a3a] shadow-inner shrink-0 w-[110px]">
          <div className="flex items-center justify-between text-[6px] font-mono text-[#525a70] px-1 mb-0.5">
            <span>LEVEL METER</span>
            <span>VU</span>
          </div>
          <div className="flex items-center gap-[2px]">
            <span className="text-[7px] font-mono text-[#525a70] w-2.5">L</span>
            {Array.from({ length: 8 }).map((_, i) => {
              const active = vuLevels[0] > i;
              let color = "bg-[#181c26]";
              if (active) {
                if (i < 5) color = "bg-[#22c55e] shadow-[0_0_4px_rgba(34,197,94,0.6)]";
                else if (i < 7) color = "bg-[#eab308] shadow-[0_0_4px_rgba(234,179,8,0.6)]";
                else color = "bg-[#ef4444] shadow-[0_0_4px_rgba(239,68,68,0.6)]";
              }
              return <span key={i} className={`h-1 w-[7px] rounded-[1px] transition-all duration-75 ${color}`} />;
            })}
          </div>
          <div className="flex items-center gap-[2px]">
            <span className="text-[7px] font-mono text-[#525a70] w-2.5">R</span>
            {Array.from({ length: 8 }).map((_, i) => {
              const active = vuLevels[1] > i;
              let color = "bg-[#181c26]";
              if (active) {
                if (i < 5) color = "bg-[#22c55e] shadow-[0_0_4px_rgba(34,197,94,0.6)]";
                else if (i < 7) color = "bg-[#eab308] shadow-[0_0_4px_rgba(234,179,8,0.6)]";
                else color = "bg-[#ef4444] shadow-[0_0_4px_rgba(239,68,68,0.6)]";
              }
              return <span key={i} className={`h-1 w-[7px] rounded-[1px] transition-all duration-75 ${color}`} />;
            })}
          </div>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-6 gap-1.5" aria-label="Reveal stages">
        {ladder.map((milliseconds) => {
          const current = milliseconds === revealMs;
          const unlocked = milliseconds <= revealMs;
          return (
            <li
              key={milliseconds}
              className="border-t-2 pt-2 text-center font-mono text-[9px] sm:text-[10px]"
              style={{
                borderColor: unlocked ? "var(--signal)" : "#303648",
                color: unlocked ? "var(--signal)" : "#9da3b6",
              }}
              aria-current={current ? "step" : undefined}
            >
              {formatDuration(milliseconds).replace(" sec", "s")}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

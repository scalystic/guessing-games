/// Shared plumbing for the YouTube IFrame API.
///
/// Extracted from PlayerBar so the result panel can stand up its own player
/// without a second copy of the loader. The script tag, the readiness flag and
/// the queue of waiting callbacks are module-level on purpose: there is one
/// `window.YT` per document, so one loader has to serve every deck on the page.

// Minimal type definitions for the YouTube IFrame Player API.
export type YTPlayerInstance = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  destroy: () => void;
  getPlayerState: () => number;
  /// Media position in seconds. The stage clock is metered off this rather than
  /// off wall-clock time — see the playback-clock note in PlayerBar.
  getCurrentTime: () => number;
  /// 0..1 of the video buffered. Distinguishes "still downloading" from
  /// "stopped trying", which getPlayerState() cannot — see armYoutubeKick.
  getVideoLoadedFraction: () => number;
  /// Used by the priming play (see primeYoutubeRound), which is the only reason
  /// the deck ever mutes: a muted play is the API's only way to make an embed
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

/// YT.PlayerState, inlined rather than read off window.YT so a state handler
/// does not depend on the API object having finished loading.
export const YT_ENDED = 0;
export const YT_PLAYING = 1;

let ytApiLoaded = false;
let ytApiReady = false;
const ytReadyCallbacks: (() => void)[] = [];

/// Run `onReady` once the IFrame API is usable, injecting the script on the
/// first call and queueing every caller that arrives before it lands.
export function loadYouTubeAPI(onReady: () => void): void {
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

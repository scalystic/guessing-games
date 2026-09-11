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
            /// Playback failed outright: `data` is a YT.PlayerError code. The
            /// decks surface this to the player — see youtubeErrorMessage.
            onError?: (event: { data: number }) => void;
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

/// YT.PlayerError codes. 100/101/150 are the video's own problem — deleted,
/// private, or embedding switched off by the uploader — and telling somebody to
/// check their connection over one of those sends them to fix the wrong thing.
/// Everything else (2 bad parameter, 5 HTML5 player failure) reaches the player
/// as a load failure, which is what a blocked or offline YouTube looks like.
const YT_ERROR_NOT_FOUND = 100;
const YT_ERROR_NOT_EMBEDDABLE = 101;
const YT_ERROR_NOT_EMBEDDABLE_ALT = 150;

/// Shown whenever a clip fails to start and the cause is, as far as the browser
/// can tell, on the way TO YouTube: the API script never loaded, the embed never
/// produced audio, the player reported a generic failure.
export const YT_CONNECTION_ERROR_MESSAGE =
  "Couldn't play this track. Please check your internet connection and make sure YouTube is accessible, then try again.";

/// Shown when YouTube answered and the answer was "not this video".
export const YT_UNAVAILABLE_ERROR_MESSAGE =
  "This track can't be played from YouTube right now. Try another round, or check your internet connection if this keeps happening.";

export function youtubeErrorMessage(code: number): string {
  return code === YT_ERROR_NOT_FOUND ||
    code === YT_ERROR_NOT_EMBEDDABLE ||
    code === YT_ERROR_NOT_EMBEDDABLE_ALT
    ? YT_UNAVAILABLE_ERROR_MESSAGE
    : YT_CONNECTION_ERROR_MESSAGE;
}

/// How long to give the API script before calling it dead.
///
/// `onerror` catches a refused or failed request, but a network that black-holes
/// the connection — the usual shape of a corporate block, and of a laptop that
/// has "connected" to a captive portal — never fires an event at all. Without
/// this the queued callbacks simply sit there forever and every deck on the page
/// stays stuck on its initial state with no way to say why.
const YT_API_TIMEOUT_MS = 12_000;

let ytApiLoading = false;
let ytApiReady = false;
let ytApiFailed = false;
const ytReadyCallbacks: (() => void)[] = [];
const ytFailureCallbacks: (() => void)[] = [];

function flushYouTubeFailure() {
  if (ytApiReady || ytApiFailed) return;
  ytApiFailed = true;
  ytApiLoading = false;
  // Nothing is ever going to call these.
  ytReadyCallbacks.length = 0;
  const callbacks = ytFailureCallbacks.splice(0);
  for (const cb of callbacks) cb();
}

/// Has a load of the IFrame API already been tried and failed? Lets a click
/// handler answer straight away rather than arming a watchdog to rediscover
/// something the page already knows.
export function isYouTubeAPIBlocked(): boolean {
  return ytApiFailed;
}

/**
 * Run `onReady` once the IFrame API is usable, injecting the script on the
 * first call and queueing every caller that arrives before it lands.
 *
 * `onFailure` runs instead if the script cannot be fetched — YouTube blocked on
 * the network, an extension eating the request, no connection at all. A caller
 * that passes it gets to say so; one that doesn't behaves exactly as before.
 *
 * A call made AFTER a failure starts a fresh attempt rather than replaying the
 * old verdict: the usual way this is reached is somebody reconnecting and
 * pressing play again, and the retry costs one script tag.
 */
export function loadYouTubeAPI(onReady: () => void, onFailure?: () => void): void {
  if (ytApiReady) { onReady(); return; }

  ytReadyCallbacks.push(onReady);
  if (onFailure) ytFailureCallbacks.push(onFailure);

  if (ytApiLoading) return;
  ytApiFailed = false;
  ytApiLoading = true;

  const prev = window.onYouTubeIframeAPIReady;
  const timer = setTimeout(flushYouTubeFailure, YT_API_TIMEOUT_MS);

  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    clearTimeout(timer);
    ytApiReady = true;
    ytApiLoading = false;
    ytFailureCallbacks.length = 0;
    const callbacks = ytReadyCallbacks.splice(0);
    for (const cb of callbacks) cb();
  };

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = () => {
    clearTimeout(timer);
    flushYouTubeFailure();
  };
  document.head.appendChild(tag);
}

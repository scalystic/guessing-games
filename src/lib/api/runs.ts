import { ApiError, apiGet, apiPost } from "@/lib/api/client";

/// HTTP client for the run loop and the typeahead. Endpoint paths live here
/// only, so a route rename is a one-file change.
///
/// Every mutation carries the run token in an `Authorization: Bearer` header
/// (docs/game-engine.md, authority #7). Owning the player cookie is not enough.

// ---------------------------------------------------------------------------
// Wire types — mirrors of the server's response shapes
// ---------------------------------------------------------------------------

export type RunMode = "DAILY" | "PRACTICE" | "ENDLESS";
export type RoundOutcome = "PENDING" | "SOLVED" | "FAILED";
export type RunStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "EXPIRED";

export type StartedRun = {
  runId: string;
  /// Returned exactly once, at start. Never re-fetchable.
  runToken: string;
  mode: RunMode;
  roundIndex: number;
  stageReached: number;
  attemptsRemaining: number;
  livesRemaining: number;
  audioUrl: string;
};

export type RoundHint = {
  decade: string | null;
  genre: string | null;
  firstLetter: string | null;
};

export type Reveal = {
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
};

export type AchievementEntry = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  unlocked: boolean;
  color: string;
};

export type AttemptResult = {
  outcome: RoundOutcome;
  stageReached: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  nextAudioUrl: string | null;
  livesRemaining: number;
  runStatus: RunStatus;
  roundIndex: number;
  /// Run totals AFTER this attempt. Authoritative — the streak rule is a server
  /// rule, so the client reports these rather than recomputing them.
  currentStreak: number;
  bestStreak: number;
  points: number | null;
  reveal: Reveal | null;
  hint: RoundHint | null;

  score: number;
  level: number;
  xpProgress: number;
  xpPerLevel: number;
  rankName: string;
  achievements: AchievementEntry[];
};

export type RunState = {
  runId: string;
  gameSlug: string;
  mode: RunMode;
  runStatus: RunStatus;
  maxAttempts: number;
  revealLadder: number[];
  livesRemaining: number;
  score: number;
  xpEarned: number;
  currentStreak: number;
  bestStreak: number;
  roundsSolved: number;
  roundsFailed: number;
  expiresAt: string | null;
  audioUrl: string | null;
  current: {
    roundIndex: number;
    stageReached: number;
    attemptsUsed: number;
    attemptsRemaining: number;
    attempts: {
      attemptIndex: number;
      isSkip: boolean;
      isCorrect: boolean;
      song: { title: string; artist: string } | null;
    }[];
    hint: RoundHint | null;
  } | null;
  past: {
    roundIndex: number;
    outcome: "SOLVED" | "FAILED";
    attemptsUsed: number;
    stageReached: number;
    points: number;
    /// ISO timestamp, or null for rows predating the column being populated.
    resolvedAt: string | null;
    song: Reveal | null;
  }[];

  level: number;
  xpProgress: number;
  xpPerLevel: number;
  rankName: string;
  achievements: AchievementEntry[];
};

export type CatalogMatch = {
  puzzleId: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
};

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

function bearer(runToken: string): HeadersInit {
  return { authorization: `Bearer ${runToken}` };
}

export function startRun(gameSlug: string, mode: RunMode = "PRACTICE"): Promise<StartedRun> {
  return apiPost<StartedRun>("/api/runs", { gameSlug, mode });
}

export function fetchRunState(runId: string, runToken: string): Promise<RunState> {
  return apiGet<RunState>(`/api/runs/${encodeURIComponent(runId)}`, {
    headers: bearer(runToken),
    cache: "no-store",
  });
}

export function submitGuess(
  runId: string,
  runToken: string,
  input: { guessedPuzzleId: string | null; rawInput: string | null; idempotencyKey: string },
): Promise<AttemptResult> {
  return apiPost<AttemptResult>(`/api/runs/${encodeURIComponent(runId)}/guess`, input, {
    headers: bearer(runToken),
  });
}

export function skipRound(
  runId: string,
  runToken: string,
  idempotencyKey: string,
): Promise<AttemptResult> {
  return apiPost<AttemptResult>(
    `/api/runs/${encodeURIComponent(runId)}/skip`,
    { idempotencyKey },
    { headers: bearer(runToken) },
  );
}

export function searchCatalog(
  gameSlug: string,
  query: string,
  init?: RequestInit,
): Promise<CatalogMatch[]> {
  const params = new URLSearchParams({ q: query });
  return apiGet<CatalogMatch[]>(
    `/api/games/${encodeURIComponent(gameSlug)}/search?${params}`,
    { cache: "no-store", ...init },
  );
}

// ---------------------------------------------------------------------------
// Stage audio
// ---------------------------------------------------------------------------

export type StageAudio = {
  /// Object URL. The caller owns it and must revokeObjectURL when done.
  objectUrl: string;
  /// Echoed by the server from RunRound.stageReached — the authoritative stage,
  /// not whatever the client thought it was asking for.
  stage: number;
  byteSize: number;
};

/// Fetch the audio the current round has earned.
///
/// Not `<audio src="/api/runs/…/audio">`, because an element's src cannot carry
/// an Authorization header and the route requires one. So: fetch with the
/// header, take the bytes, wrap them in an object URL and hand THAT to the
/// element. The alternative — moving the run token into a cookie so the element
/// could authenticate itself — would make the token ambient on every request
/// and give up the property that drives a run.
///
/// Fetching the whole stage up front also means playback has no network
/// dependency mid-clip, which matters at stage 1: the whole slice is ~3KB and a
/// stall partway through a 200ms clip is the entire clip.
export async function fetchStageAudio(runId: string, runToken: string): Promise<StageAudio> {
  return fetchAudio(runId, runToken, false);
}

/// Fetch the whole clip for the round that just resolved, for the result panel.
///
/// Only reachable once a round is over — see the route's `?reveal=1` note. The
/// player has already been shown the answer at this point, so the full clip is
/// no longer privileged information.
export async function fetchRevealAudio(runId: string, runToken: string): Promise<StageAudio> {
  return fetchAudio(runId, runToken, true);
}

async function fetchAudio(
  runId: string,
  runToken: string,
  reveal: boolean,
): Promise<StageAudio> {
  const path = `/api/runs/${encodeURIComponent(runId)}/audio${reveal ? "?reveal=1" : ""}`;
  const response = await fetch(path, {
    headers: bearer(runToken),
    cache: "no-store",
  });

  if (!response.ok) {
    // The route returns the standard JSON envelope on failure, not audio.
    let code = "unexpected_status";
    let message = `Stage audio failed with ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: { code: string; message: string } };
      if (body.error) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      // Non-JSON error body; keep the defaults.
    }
    throw new ApiError(response.status, code, message);
  }

  const blob = await response.blob();
  const stage = Number.parseInt(response.headers.get("x-reveal-stage") ?? "", 10);

  return {
    objectUrl: URL.createObjectURL(blob),
    stage: Number.isFinite(stage) ? stage : 1,
    byteSize: blob.size,
  };
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/// One key per attempt the player intends to make, generated before the request
/// and REUSED on retry — that is what makes a retry a no-op instead of a second
/// attempt against the same round.
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Older Safari. The server only requires 8-128 chars and global uniqueness.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

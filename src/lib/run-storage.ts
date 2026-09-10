/// Where the run token survives a reload.
///
/// The token is handed out exactly once by POST /api/runs and is not
/// re-fetchable, so holding it only in React state means every refresh orphans
/// the run mid-round. Stashing it here is what makes GET /api/runs/[runId]
/// useful.
///
/// localStorage rather than sessionStorage: a run lives for RUN_TTL_MINUTES
/// (180 by default), which comfortably outlasts closing a tab. It is scoped to
/// one run and confers nothing else — it cannot read a profile, change a
/// password, or start a second run — so it is a capability for one game in
/// progress, not an account credential.

/// One entry PER MODE, not one entry overall. A single slot meant opening the
/// daily challenge evicted the practice run's token — and the practice run is
/// still alive server-side for RUN_TTL_MINUTES, so that was a resumable run
/// thrown away by navigation alone. `sargam.run.v1` (unsuffixed) is the old
/// single-slot key and is deleted on the next save.
const KEY_PREFIX = "sargam.run.v1";
const LEGACY_KEY = KEY_PREFIX;

export type StoredRunMode = "PRACTICE" | "DAILY";

export type StoredRun = {
  runId: string;
  runToken: string;
  gameSlug: string;
  mode: StoredRunMode;
};

function keyFor(mode: StoredRunMode): string {
  return `${KEY_PREFIX}:${mode}`;
}

function isStoredRun(value: unknown): value is StoredRun {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.runId === "string" &&
    typeof candidate.runToken === "string" &&
    typeof candidate.gameSlug === "string" &&
    (candidate.mode === "PRACTICE" || candidate.mode === "DAILY")
  );
}

/// Returns null on a missing, malformed, wrong-game, or wrong-mode entry. Parsed
/// defensively because this is user-writable storage that a previous version of
/// the app may also have written in a different shape.
export function loadStoredRun(gameSlug: string, mode: StoredRunMode): StoredRun | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(keyFor(mode));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredRun(parsed) || parsed.gameSlug !== gameSlug || parsed.mode !== mode) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredRun(run: StoredRun): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(run.mode), JSON.stringify(run));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Private mode or a full quota. A run that can't be resumed still plays.
  }
}

export function clearStoredRun(mode: StoredRunMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(mode));
  } catch {
    // Nothing to do — see above.
  }
}

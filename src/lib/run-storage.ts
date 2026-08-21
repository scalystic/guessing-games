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

const KEY = "sargam.run.v1";

export type StoredRun = {
  runId: string;
  runToken: string;
  gameSlug: string;
};

function isStoredRun(value: unknown): value is StoredRun {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.runId === "string" &&
    typeof candidate.runToken === "string" &&
    typeof candidate.gameSlug === "string"
  );
}

/// Returns null on a missing, malformed, or wrong-game entry. Parsed defensively
/// because this is user-writable storage that a previous version of the app may
/// also have written in a different shape.
export function loadStoredRun(gameSlug: string): StoredRun | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredRun(parsed) || parsed.gameSlug !== gameSlug) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredRun(run: StoredRun): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // Private mode or a full quota. A run that can't be resumed still plays.
  }
}

export function clearStoredRun(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — see above.
  }
}

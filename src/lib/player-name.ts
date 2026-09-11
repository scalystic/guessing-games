/// Reading and writing the one name a player is known by — Player.displayName.
///
/// Extracted from MultiplayerPickerModal, which owned all of this privately
/// until the daily challenge needed to ask for a name too. Two copies of the
/// fetch would have been two places to keep the storage key and the error
/// handling in step.
///
/// Client-safe on purpose: no "server-only", no Prisma. Both callers are
/// client components, and the write goes through the API route so the
/// validation lives in one place (see the allowlist regex on
/// /api/players/display-name — that value reaches server-built HTML strings).

/// Mirrors the name back onto the device, so the next prompt can prefill
/// instead of asking a returning player the same question twice.
///
/// Not the source of truth — Player.displayName is. This is a convenience
/// cache, which is why every read and write below is wrapped: private
/// browsing and disabled storage both throw on access, and neither is a
/// reason to fail.
const NAME_STORAGE_KEY = "sargam.playerName";

export function loadSavedName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    // Private browsing, storage disabled, etc. — just start blank.
    return "";
  }
}

/// Sets Player.displayName server-side so real names — not the generic
/// "Player" fallback — show up in chat, round announcements, and the
/// leaderboard. Guests have no name at all otherwise (see lib/guest.ts).
///
/// Returns null on success, or a message to show the player. The route
/// provisions a guest identity if the caller has none, so this is safe to call
/// before a player has ever started a run.
export async function saveDisplayName(name: string): Promise<string | null> {
  try {
    const res = await fetch("/api/players/display-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return body?.error?.message ?? "Couldn't save your name.";
    try {
      window.localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch {
      // Non-fatal — the name is already saved server-side either way.
    }
    return null;
  } catch {
    return "Network error — check your connection.";
  }
}

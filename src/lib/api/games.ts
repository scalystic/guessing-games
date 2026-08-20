import { apiGet } from "@/lib/api/client";
import type { GameDetail, GameSummary } from "@/lib/games";

/// HTTP client for the games endpoints. Endpoint paths live here only, so a
/// route rename is a one-file change.
export function fetchGames(init?: RequestInit): Promise<GameSummary[]> {
  return apiGet<GameSummary[]>("/api/games", init);
}

export function fetchGame(
  slug: string,
  init?: RequestInit,
): Promise<GameDetail> {
  return apiGet<GameDetail>(`/api/games/${encodeURIComponent(slug)}`, init);
}

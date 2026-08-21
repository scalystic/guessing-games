"use client";

import { useEffect, useState } from "react";
import type { Song } from "@/data/songs";

export type PreviewStatus = "loading" | "ready" | "unavailable";

// iTunes Search API, called directly from the browser — it sends
// `access-control-allow-origin: *`, so there's no CORS blocker and no
// server-side proxy needed. (An earlier version routed this through our
// own API to a different provider; that one soft-blocks datacenter/server
// IPs via bot detection and never returned real results in testing.)
// `country=IN` biases matches toward the correct Bollywood release rather
// than a cover or a different regional edition.
const SEARCH_URL = "https://itunes.apple.com/search";

type ITunesTrack = { previewUrl?: string };
type ITunesResponse = { results?: ITunesTrack[] };

function primaryArtist(artist: string) {
  return artist.split(/,|&|\bft\.?\b|\bfeat\.?\b/i)[0]?.trim() || artist;
}

// Session-lived cache so replaying a song or cycling back to one already
// looked up doesn't re-fetch.
const cache = new Map<string, string | null>();

export function usePreviewUrl(song: Song) {
  // Initial state must be hydration-safe: the `cache` Map is a client-only
  // side channel (only ever written to from this effect), so its server-side
  // copy and the client's can disagree. Always start from the same
  // deterministic value on both, and let the effect below (client-only,
  // post-hydration) pick up whatever the cache already knows.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("loading");

  // Reset for the new song during render — the effect below only ever
  // calls setState from its async callback, never synchronously in its body.
  const [lastSongId, setLastSongId] = useState(song.id);
  if (lastSongId !== song.id) {
    setLastSongId(song.id);
    setPreviewUrl(null);
    setStatus("loading");
  }

  useEffect(() => {
    const cached = cache.get(song.id);
    if (cached !== undefined) {
      setPreviewUrl(cached);
      setStatus(cached ? "ready" : "unavailable");
      return;
    }

    let cancelled = false;
    const query = `${song.title} ${primaryArtist(song.artist)}`;
    const params = new URLSearchParams({
      term: query,
      media: "music",
      limit: "1",
      country: "IN",
    });

    fetch(`${SEARCH_URL}?${params.toString()}`)
      .then((res) => res.json())
      .then((data: ITunesResponse) => {
        if (cancelled) return;
        const url = data.results?.[0]?.previewUrl ?? null;
        cache.set(song.id, url);
        setPreviewUrl(url);
        setStatus(url ? "ready" : "unavailable");
      })
      .catch(() => {
        if (cancelled) return;
        cache.set(song.id, null);
        setStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [song.id, song.title, song.artist]);

  return { previewUrl, status };
}

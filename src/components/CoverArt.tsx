"use client";

import { useEffect, useState } from "react";
import { fetchAlbumArtUrl } from "@/lib/album-art";

/// Real cover art, wherever showing one doesn't leak the mystery track's
/// answer (admin catalog table, guess-search results — never the live round
/// itself, see src/lib/cover.ts). Falls back to a neutral theme-coloured tile
/// with a play glyph on top while loading or when iTunes has no match —
/// deliberately not the per-song gradient from src/lib/cover.ts, which is
/// meant to read as "this is a placeholder standing in for the mystery
/// track," not as a generic empty state here.
export function CoverArt({
  title,
  artist,
  album,
  className = "h-8 w-8 rounded-lg",
}: {
  title: string;
  artist: string;
  album: string | null;
  className?: string;
}) {
  const [artUrl, setArtUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlbumArtUrl(title, artist, album).then((url) => {
      if (!cancelled) setArtUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [title, artist, album]);

  if (artUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={artUrl} alt="" className={`shrink-0 object-cover ${className}`} />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center border border-(--hairline) bg-(--surface) text-(--text-faint) ${className}`}
      aria-hidden="true"
    >
      <svg width="40%" height="40%" viewBox="0 0 20 20" fill="currentColor">
        <path d="M5 3.5v13l11-6.5-11-6.5z" />
      </svg>
    </span>
  );
}

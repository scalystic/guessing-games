"use client";

export function HowToPlayList({ maxAttempts }: { maxAttempts: number }) {
  return (
    <ul className="space-y-2 text-sm text-(--text-dim)">
      <li>🎵 Press play to hear a short clip of the mystery song.</li>
      <li>⌨️ Type a title or singer and pick from the list to guess.</li>
      <li>⏭️ Wrong or skipped guesses unlock a longer clip, up to {maxAttempts} attempts.</li>
      <li>💡 Stuck? A free decade + genre hint appears after 2 misses.</li>
      <li>🔥 Guess faster (fewer attempts) for a bigger score and streak bonus.</li>
    </ul>
  );
}

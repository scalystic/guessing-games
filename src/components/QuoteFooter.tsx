"use client";

// Unattributed on purpose — putting a real name on lines nobody can verify
// is worse than just saying where they're not from.
const QUOTES = [
  "Music is the heartbeat of Bollywood.",
  "Every scene needs a song, and every song tells a story.",
  "A good tune outlives the film it was written for.",
  "Three chords and a good hook can carry a whole movie.",
];

// Picked from the calendar day, not Math.random() — same value on the
// server and during hydration, so there's nothing for React to reconcile.
function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export function QuoteFooter({ accent }: { accent: string }) {
  const quote = QUOTES[dayOfYear() % QUOTES.length];

  return (
    <div
      className="flex items-center justify-center gap-2 rounded-2xl border border-(--hairline) bg-(--surface) px-4 py-3 text-center text-xs text-(--text-dim)"
      style={{ borderColor: `${accent}20` }}
    >
      <span aria-hidden="true">🎵</span>
      <span className="italic">&ldquo;{quote}&rdquo;</span>
      <span aria-hidden="true">🎵</span>
    </div>
  );
}

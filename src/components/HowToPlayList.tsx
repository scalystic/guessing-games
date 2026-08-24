"use client";

export function HowToPlayList({ maxAttempts }: { maxAttempts: number }) {
  const steps = [
    "Play the mystery clip. The first signal is only 0.2 seconds.",
    "Search by song title or artist, then choose a catalog match.",
    `A wrong guess or skip unlocks a longer clip. You have ${maxAttempts} attempts.`,
    "After two misses, a decade and genre clue appears when available.",
    "Recognise the song from less audio to earn a higher score.",
  ];

  return (
    <ol className="space-y-3 text-sm text-(--text-dim)">
      {steps.map((step, index) => (
        <li key={step} className="grid grid-cols-[28px_1fr] gap-3 leading-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-(--hairline) font-mono text-[10px] text-(--text-faint)">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

"use client";

type Props = {
  streak: number;
  bestStreak: number;
  score: number;
  roundsPlayed: number;
  roundsSolved: number;
};

export function StatsList({ streak, bestStreak, score, roundsPlayed, roundsSolved }: Props) {
  const winRate = roundsPlayed > 0 ? Math.round((roundsSolved / roundsPlayed) * 100) : null;

  const rows = [
    { label: "Score", value: score.toLocaleString() },
    { label: "Current streak", value: String(streak) },
    { label: "Best streak", value: String(bestStreak) },
    { label: "Rounds played", value: String(roundsPlayed) },
    { label: "Win rate", value: winRate === null ? "—" : `${winRate}%` },
  ];

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li
          key={r.label}
          className="flex items-center justify-between border-b border-(--hairline) pb-2.5 text-sm last:border-0 last:pb-0"
        >
          <span className="text-(--text-faint)">{r.label}</span>
          <span className="font-semibold text-(--text)">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

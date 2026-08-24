"use client";

import Link from "next/link";
// Type-only — erased at compile time, so @/lib/games (and Prisma) never reach
// the client bundle.
import type { GameSummary } from "@/lib/games";

export default function HomeView({ games }: { games: GameSummary[] }) {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-10 bg-white px-6 py-20 sm:px-16 dark:bg-black">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className="h-11 w-11 rounded-xl bg-cover bg-center"
              style={{ backgroundImage: "url('/brand/cluecade-mark.png')" }}
              aria-hidden="true"
            />
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Cluecade
            </h1>
          </div>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Pick a clue. Trust your instinct.
          </p>
        </header>

        {games.length ? (
          <ul className="flex flex-col gap-4">
            {games.map((game) => (
              <li key={game.id}>
                <Link
                  href={`/games/${game.slug}`}
                  className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-6 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                >
                  <span className="text-xl font-medium text-black dark:text-zinc-50">
                    {game.name}
                  </span>
                  {game.tagline ? (
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {game.tagline}
                    </span>
                  ) : null}
                  <span className="font-mono text-sm text-zinc-500 tabular-nums dark:text-zinc-500">
                    {game.dailyRounds} songs a day · {game.maxAttempts} attempts
                    each
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-600 dark:text-zinc-400">
            No games are live yet. Run{" "}
            <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
              npm run db:seed
            </code>{" "}
            to load the songless config.
          </p>
        )}
      </main>
    </div>
  );
}

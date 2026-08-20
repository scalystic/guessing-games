"use client";

import Link from "next/link";
// Type-only — erased at compile time, so @/lib/games (and Prisma) never reach
// the client bundle.
import type { GameDetail } from "@/lib/games";

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function GameView({ game }: { game: GameDetail }) {
  const ladder = game.revealLadder;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-12 bg-white px-6 py-20 sm:px-16 dark:bg-black">
        <header className="flex flex-col gap-4">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-black dark:text-zinc-500 dark:hover:text-zinc-50"
          >
            ← All games
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {game.name}
          </h1>
          {game.tagline ? (
            <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              {game.tagline}
            </p>
          ) : null}
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
            How a round works
          </h2>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-black/8 bg-black/8 sm:grid-cols-4 dark:border-white/[.145] dark:bg-white/[.145]">
            {[
              { label: "Attempts", value: game.maxAttempts },
              { label: "Lives", value: game.livesPerRun },
              { label: "Daily rounds", value: game.dailyRounds },
              {
                label: "Max clip",
                value: ladder.length
                  ? formatSeconds(ladder[ladder.length - 1])
                  : "—",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col gap-1 bg-white p-4 dark:bg-black"
              >
                <dt className="text-xs text-zinc-500 dark:text-zinc-500">
                  {stat.label}
                </dt>
                <dd className="text-2xl font-semibold text-black tabular-nums dark:text-zinc-50">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {ladder.length ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
              Reveal ladder
            </h2>
            <ol className="flex flex-wrap gap-2">
              {ladder.map((ms, index) => (
                <li
                  key={index}
                  className="flex items-baseline gap-2 rounded-full border border-black/8 px-4 py-2 font-mono text-sm text-black dark:border-white/[.145] dark:text-zinc-50"
                >
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {index + 1}
                  </span>
                  {formatSeconds(ms)}
                </li>
              ))}
            </ol>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Every wrong guess or skip unlocks the next clip. The ladder never
              changes — difficulty comes from the songs, not the timer.
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
            The daily challenge
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            One challenge a day, no difficulty to pick. Everyone gets the same{" "}
            {game.dailyRounds} songs in the same order, and they get harder as
            you go — the first round is a track almost everyone knows, the last
            one isn&apos;t. You have {game.livesPerRun} lives, so{" "}
            {game.livesPerRun} missed songs end the run early.
          </p>
        </section>
      </main>
    </div>
  );
}

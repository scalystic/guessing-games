import { prisma } from "@/lib/db";

export default async function UsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const players = await prisma.player.findMany({
    where: {
      kind: "USER",
      ...(query
        ? {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { displayName: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      xp: true,
      level: true,
      coins: true,
      lastSeenAt: true,
      createdAt: true,
      gameStats: {
        where: { game: { slug: "songless" } },
        select: {
          runsPlayed: true,
          roundsPlayed: true,
          roundsSolved: true,
          bestRunScore: true,
          bestDailyScore: true,
          bestRoundStreak: true,
          currentDailyStreak: true,
          longestDailyStreak: true,
        },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
          Manage User
        </h1>
        <p className="mt-1 text-sm text-(--text-dim)">
          {players.length} registered user{players.length === 1 ? "" : "s"}.
          Read-only.
        </p>
      </div>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by email or name…"
          className="w-full max-w-sm rounded-lg border border-(--hairline) bg-(--surface-strong) px-3.5 py-2 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
        />
        <button
          type="submit"
          className="rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
        >
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-(--hairline) bg-(--surface-strong)">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--hairline) text-(--text-faint)">
            <tr>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">XP / Level</th>
              <th className="px-4 py-3 font-medium">Coins</th>
              <th className="px-4 py-3 font-medium">Runs played</th>
              <th className="px-4 py-3 font-medium">Rounds solved</th>
              <th className="px-4 py-3 font-medium">Best run score</th>
              <th className="px-4 py-3 font-medium">Daily streak</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const stats = player.gameStats[0];
              return (
                <tr key={player.id} className="border-b border-(--hairline) last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-(--text)">
                      {player.displayName ?? "—"}
                    </div>
                    <div className="text-xs text-(--text-faint)">{player.email}</div>
                  </td>
                  <td className="px-4 py-3 text-(--text-dim)">
                    {player.xp} / {player.level}
                  </td>
                  <td className="px-4 py-3 text-(--text-dim)">{player.coins}</td>
                  <td className="px-4 py-3 text-(--text-dim)">{stats?.runsPlayed ?? 0}</td>
                  <td className="px-4 py-3 text-(--text-dim)">{stats?.roundsSolved ?? 0}</td>
                  <td className="px-4 py-3 text-(--text-dim)">{stats?.bestRunScore ?? 0}</td>
                  <td className="px-4 py-3 text-(--text-dim)">
                    {stats?.currentDailyStreak ?? 0} (best {stats?.longestDailyStreak ?? 0})
                  </td>
                  <td className="px-4 py-3 text-(--text-faint)">
                    {player.lastSeenAt.toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {players.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-(--text-faint)">
                  No users match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

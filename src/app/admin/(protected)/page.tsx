import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function AdminDashboardPage() {
  const [totalSongs, blockedSongs, totalUsers, songsMissingClip] =
    await Promise.all([
      prisma.song.count(),
      prisma.puzzle.count({ where: { isBlocked: true } }),
      prisma.player.count({ where: { kind: "USER" } }),
      prisma.puzzle.count({ where: { assets: { none: { kind: "AUDIO_CLIP" } } } }),
    ]);

  const cards = [
    { label: "Songs in catalog", value: totalSongs, href: "/admin/songs" },
    { label: "Removed from catalog", value: blockedSongs, href: "/admin/songs?status=removed" },
    { label: "Registered users", value: totalUsers, href: "/admin/users" },
    { label: "Songs missing a clip", value: songsMissingClip, href: "/admin/songs?status=missing-clip" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-(--text-dim)">
          Overview of the song catalog and player base.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-2xl border border-(--hairline) bg-(--surface-strong) p-5 transition hover:bg-(--surface-hover)"
          >
            <p className="text-3xl font-bold text-(--text)">{card.value}</p>
            <p className="mt-1 text-sm text-(--text-dim)">{card.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

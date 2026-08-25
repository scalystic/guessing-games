import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import SongForm from "../../song-form";

export default async function EditSongPage({
  params,
}: PageProps<"/admin/songs/[puzzleId]/edit">) {
  const { puzzleId } = await params;

  const song = await prisma.song.findUnique({
    where: { puzzleId },
    include: {
      puzzle: {
        select: {
          seedPopularity: true,
          licenseSource: true,
          ingestSource: true,
          ingestRef: true,
          isActive: true,
          isBlocked: true,
        },
      },
    },
  });

  if (!song) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-(--text)">
          Edit song
        </h1>
        <p className="mt-1 text-sm text-(--text-dim)">
          {song.title} — {song.artist}
        </p>
      </div>

      <div className="max-w-2xl rounded-2xl border border-(--hairline) bg-(--surface-strong) p-6">
        <SongForm
          puzzleId={puzzleId}
          initial={{
            title: song.title,
            artist: song.artist,
            album: song.album,
            movie: song.movie,
            releaseYear: song.releaseYear,
            genres: song.genres,
            aliases: song.aliases,
            hookStartMs: song.hookStartMs,
            seedPopularity: song.puzzle.seedPopularity,
            licenseSource: song.puzzle.licenseSource,
            ingestSource: song.puzzle.ingestSource,
            ingestRef: song.puzzle.ingestRef,
            isrc: song.isrc,
            externalId: song.externalId,
            isActive: song.puzzle.isActive,
            isBlocked: song.puzzle.isBlocked,
          }}
        />
      </div>
    </div>
  );
}

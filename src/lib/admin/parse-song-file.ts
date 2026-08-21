import {
  parseBuffer,
  CouldNotDetermineFileTypeError,
  UnsupportedFileTypeError,
} from "music-metadata";
import type { ParsedSongMetadata } from "@/lib/admin/song-validation";

/// Shared by POST /api/song/parse and POST /api/song (multipart create) so
/// both read a file's embedded tags identically — no ffmpeg/ffprobe
/// involved, so this works in any environment. It reads tags only: it does
/// NOT cut a reveal clip, and does not touch storage — `npm run ingest` is
/// still what turns a file into a playable PuzzleAsset.

export const MAX_AUDIO_UPLOAD_BYTES = 30 * 1024 * 1024; // 30MB — well above any 3-4 min MP3.

export class UnparsableAudioFileError extends Error {}

export async function parseAudioFile(file: File): Promise<ParsedSongMetadata> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Hint by filename/extension, not MIME type: music-metadata's content-type
    // parsing (both the explicit mimeType hint and its content-sniffing
    // fallback) goes through the `content-type` package, whose default
    // import doesn't resolve correctly under this project's ESM setup and
    // silently swallows the error — findLoaderForContentType always returns
    // undefined as a result. The extension-based lookup doesn't touch that
    // code path, so it's the only reliable way to get a parser matched here.
    const metadata = await parseBuffer(buffer, { path: file.name }, { duration: true });

    return {
      title: metadata.common.title?.trim() || undefined,
      artist: metadata.common.artist?.trim() || undefined,
      album: metadata.common.album?.trim() || undefined,
      releaseYear: metadata.common.year ?? undefined,
      genres: metadata.common.genre?.length ? metadata.common.genre : undefined,
      durationMs: metadata.format.duration
        ? Math.round(metadata.format.duration * 1000)
        : undefined,
    };
  } catch (error) {
    // An unparsable/corrupt/unrecognized file isn't a server bug.
    if (
      error instanceof CouldNotDetermineFileTypeError ||
      error instanceof UnsupportedFileTypeError
    ) {
      throw new UnparsableAudioFileError("Couldn't read metadata from this file.");
    }
    throw error;
  }
}

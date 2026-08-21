import { z } from "zod";

// Metadata only — no audio processing. The admin panel never touches
// PuzzleAsset directly; a song created or edited here has no playable clip
// until `npm run ingest` runs against a manifest with the same
// ingestSource/ingestRef. JSON-typed (arrays/booleans/numbers as real JS
// values) since this is consumed by the /api/song route handlers via
// request.json(), not by parsing FormData.
export const SongMetadataSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(300),
  artist: z.string().trim().min(1, "Artist is required.").max(300),
  album: z.string().trim().max(300).nullable().optional(),
  releaseYear: z.number().int().min(1850).max(2100).nullable().optional(),
  genres: z.array(z.string().trim().min(1)).default([]),
  aliases: z.array(z.string().trim().min(1)).default([]),
  hookStartMs: z.number().int().min(0).default(0),
  seedPopularity: z.number().int().min(0).max(100),
  licenseSource: z.string().trim().max(200).nullable().optional(),
  ingestSource: z.string().trim().max(200).nullable().optional(),
  ingestRef: z.string().trim().max(200).nullable().optional(),
  isrc: z.string().trim().max(50).nullable().optional(),
  externalId: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().default(true),
  isBlocked: z.boolean().default(false),
});

export type SongMetadataInput = z.infer<typeof SongMetadataSchema>;

// What POST /api/song/parse returns — a subset of SongMetadataInput read
// from the uploaded file's embedded tags, used to prefill the form. Every
// field is optional since not every file carries every tag.
export type ParsedSongMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  releaseYear?: number;
  genres?: string[];
  durationMs?: number;
};

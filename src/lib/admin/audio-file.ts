/// Extensions accepted by the admin song upload/parse flow. Kept as an
/// explicit allowlist (not "any audio/* the browser reports") because a
/// browser's guessed MIME type is unreliable — the extension check below is
/// what actually gates the request server-side.
export const ALLOWED_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "aac"];

/// A comma-separated `accept` value covering both MIME hints (for browsers
/// that report them) and raw extensions (for browsers/OSes that don't) —
/// mirrors ALLOWED_AUDIO_EXTENSIONS so the two never drift apart.
export const AUDIO_FILE_ACCEPT = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/flac",
  "audio/ogg",
  "audio/aac",
  ...ALLOWED_AUDIO_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

export function hasAllowedAudioExtension(filename: string): boolean {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  if (!match) return false;
  return ALLOWED_AUDIO_EXTENSIONS.includes(match[1].toLowerCase());
}

import { getAdminUser } from "@/lib/admin/auth";
import { hasAllowedAudioExtension, ALLOWED_AUDIO_EXTENSIONS } from "@/lib/admin/audio-file";
import {
  parseAudioFile,
  UnparsableAudioFileError,
  MAX_AUDIO_UPLOAD_BYTES,
} from "@/lib/admin/parse-song-file";
import { jsonError, jsonOk, internalErrorJson } from "@/lib/api/response";

/// Reads embedded tags out of an uploaded audio file to prefill the add-song
/// form. The uploaded bytes are never stored — `npm run ingest` is still what
/// turns a file into a playable PuzzleAsset. This endpoint exists purely to
/// save an admin from retyping a title/artist/album that's already embedded
/// in the file.
export async function POST(request: Request): Promise<Response> {
  const admin = await getAdminUser();
  if (!admin) return jsonError(401, "unauthorized", "Admin sign-in required.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "invalid_form_data", "Expected multipart/form-data.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError(422, "missing_file", 'Expected a "file" field with the audio file.');
  }
  if (file.size === 0) {
    return jsonError(422, "empty_file", "The uploaded file is empty.");
  }
  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    return jsonError(413, "file_too_large", "File exceeds the 30MB limit.");
  }
  if (!hasAllowedAudioExtension(file.name)) {
    return jsonError(
      422,
      "unsupported_extension",
      `Only audio files are supported (${ALLOWED_AUDIO_EXTENSIONS.join(", ")}).`,
    );
  }

  try {
    const parsed = await parseAudioFile(file);
    return jsonOk(parsed);
  } catch (error) {
    if (error instanceof UnparsableAudioFileError) {
      return jsonError(
        422,
        "unparsable_file",
        "Couldn't read metadata from this file — fill in the fields manually.",
      );
    }
    return internalErrorJson("song:parse", error);
  }
}

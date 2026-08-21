"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { AUDIO_FILE_ACCEPT, ALLOWED_AUDIO_EXTENSIONS, hasAllowedAudioExtension } from "@/lib/admin/audio-file";

type Props = {
  onCreated: () => void;
};

// Upload-only: the schema still needs title/artist/seedPopularity, but the
// server (POST /api/song) fills those in from the file's embedded tags, or
// from the filename / flat defaults when the file has no usable tags — see
// the fallback block in src/app/api/song/route.ts. Anyone who needs to set
// those precisely edits the song afterward from the list.
export function AddSongModal({ onCreated }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    setIsOpen(false);
    reset();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && !hasAllowedAudioExtension(selected.name)) {
      setFile(null);
      event.target.value = "";
      setError(`Only audio files are supported (${ALLOWED_AUDIO_EXTENSIONS.join(", ")}).`);
      return;
    }
    setError(null);
    setFile(selected);
  }

  function handleSubmit() {
    if (!file) {
      setError("Choose an audio file first.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const body = new FormData();
      body.append("file", file);

      let response: Response;
      try {
        response = await fetch("/api/song", { method: "POST", body });
      } catch {
        setError("Network error — please try again.");
        return;
      }

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Something went wrong.");
        return;
      }

      close();
      onCreated();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500"
      >
        + Add song
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-(--scrim) p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-(--hairline) bg-(--surface-strong) p-6"
          >
            <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
              Add song
            </p>
            <p className="mt-1 text-sm text-(--text-dim)">
              Upload an audio file — title, artist, and other tags are read
              automatically. This doesn&apos;t cut a playable clip (no ffmpeg
              here); run <code>npm run ingest</code> separately for that.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {/* No hiding, no wrapping label, no ref.click() — the real
                  native <input type="file"> is directly visible and
                  clickable, styled only via Tailwind's file: variant (which
                  targets the browser's own file-picker button). If this
                  doesn't open a dialog either, the bug isn't in how the
                  input is styled. */}
              <input
                ref={fileInputRef}
                type="file"
                accept={AUDIO_FILE_ACCEPT}
                onChange={handleFileChange}
                className="text-sm text-(--text-dim) file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-(--hairline) file:bg-(--surface) file:px-4 file:py-2 file:text-sm file:font-medium file:text-(--text) hover:file:bg-(--surface-hover)"
              />
              <p className="text-xs text-(--text-faint)">
                {file ? `Selected: ${file.name}` : `Supported: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")}`}
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="text-sm font-medium text-(--text-dim) transition hover:text-(--text)"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || !file}
                className="flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

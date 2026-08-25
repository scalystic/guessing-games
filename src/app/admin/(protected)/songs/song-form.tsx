"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type SongFormInitial = {
  title: string;
  artist: string;
  album: string | null;
  movie: string | null;
  releaseYear: number | null;
  genres: string[];
  aliases: string[];
  hookStartMs: number;
  seedPopularity: number;
  licenseSource: string | null;
  ingestSource: string | null;
  ingestRef: string | null;
  isrc: string | null;
  externalId: string | null;
  isActive: boolean;
  isBlocked: boolean;
};

type Props = {
  /// Identifies which puzzle PUT /api/song/[puzzleId] targets.
  puzzleId: string;
  initial: SongFormInitial;
};

type FieldValues = {
  title: string;
  artist: string;
  album: string;
  movie: string;
  releaseYear: string;
  genres: string;
  aliases: string;
  hookStartMs: string;
  seedPopularity: string;
  licenseSource: string;
  ingestSource: string;
  ingestRef: string;
  isrc: string;
  externalId: string;
  isActive: boolean;
  isBlocked: boolean;
};

function toFieldValues(initial: SongFormInitial): FieldValues {
  return {
    title: initial.title,
    artist: initial.artist,
    album: initial.album ?? "",
    movie: initial.movie ?? "",
    releaseYear: initial.releaseYear != null ? String(initial.releaseYear) : "",
    genres: initial.genres.join(", "),
    aliases: initial.aliases.join(", "),
    hookStartMs: String(initial.hookStartMs),
    seedPopularity: String(initial.seedPopularity),
    licenseSource: initial.licenseSource ?? "",
    ingestSource: initial.ingestSource ?? "",
    ingestRef: initial.ingestRef ?? "",
    isrc: initial.isrc ?? "",
    externalId: initial.externalId ?? "",
    isActive: initial.isActive,
    isBlocked: initial.isBlocked,
  };
}

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-violet-400 dark:focus:ring-violet-400/20";
const labelClass = "text-sm font-medium text-(--text-dim)";

// Editing an existing song is metadata-only, same as it's always been —
// there's no re-upload here. Creating a new song is a separate, much
// simpler upload-only flow (see add-song-modal.tsx), which hands the file
// straight to POST /api/song and lets the server derive these fields from
// its tags; this form is what an admin uses afterward to correct anything
// the tags got wrong.
export default function SongForm({ puzzleId, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<FieldValues>(() => toFieldValues(initial));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setField<K extends keyof FieldValues>(key: K, value: FieldValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);

    const payload = {
      title: values.title,
      artist: values.artist,
      album: values.album || null,
      movie: values.movie || null,
      releaseYear: values.releaseYear ? Number(values.releaseYear) : null,
      genres: values.genres
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      aliases: values.aliases
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      hookStartMs: values.hookStartMs ? Number(values.hookStartMs) : 0,
      seedPopularity: Number(values.seedPopularity),
      licenseSource: values.licenseSource || null,
      ingestSource: values.ingestSource || null,
      ingestRef: values.ingestRef || null,
      isrc: values.isrc || null,
      externalId: values.externalId || null,
      isActive: values.isActive,
      isBlocked: values.isBlocked,
    };

    startTransition(async () => {
      let response: Response;
      try {
        response = await fetch(`/api/song/${puzzleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        setMessage("Network error — please try again.");
        return;
      }

      const json = await response.json();
      if (!response.ok) {
        setFieldErrors(json?.error?.fieldErrors ?? {});
        setMessage(json?.error?.message ?? "Something went wrong.");
        return;
      }

      router.push("/admin/songs");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {message && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-(--hairline) bg-(--surface) px-4 py-3 text-sm text-(--text-dim)">
        Metadata only. A song has no playable clip until{" "}
        <code>npm run ingest</code> is run against a manifest with the same
        ingest source/ref.
      </div>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          name="title"
          label="Title"
          required
          value={values.title}
          onChange={(v) => setField("title", v)}
          error={fieldErrors.title}
        />
        <Field
          name="artist"
          label="Artist"
          required
          value={values.artist}
          onChange={(v) => setField("artist", v)}
          error={fieldErrors.artist}
        />
        <Field
          name="album"
          label="Album"
          value={values.album}
          onChange={(v) => setField("album", v)}
          error={fieldErrors.album}
        />
        <Field
          name="movie"
          label="Movie (leave blank if not from a film)"
          value={values.movie}
          onChange={(v) => setField("movie", v)}
          error={fieldErrors.movie}
        />
        <Field
          name="releaseYear"
          label="Release year"
          type="number"
          value={values.releaseYear}
          onChange={(v) => setField("releaseYear", v)}
          error={fieldErrors.releaseYear}
        />
        <Field
          name="genres"
          label="Genres (comma-separated)"
          value={values.genres}
          onChange={(v) => setField("genres", v)}
          error={fieldErrors.genres}
        />
        <Field
          name="aliases"
          label="Aliases (comma-separated)"
          value={values.aliases}
          onChange={(v) => setField("aliases", v)}
          error={fieldErrors.aliases}
        />
        <Field
          name="hookStartMs"
          label="Hook start (ms)"
          type="number"
          value={values.hookStartMs}
          onChange={(v) => setField("hookStartMs", v)}
          error={fieldErrors.hookStartMs}
        />
        <Field
          name="seedPopularity"
          label="Seed popularity (0–100) — retunes seed, not live popularity"
          type="number"
          required
          value={values.seedPopularity}
          onChange={(v) => setField("seedPopularity", v)}
          error={fieldErrors.seedPopularity}
        />
        <Field
          name="licenseSource"
          label="License source"
          value={values.licenseSource}
          onChange={(v) => setField("licenseSource", v)}
          error={fieldErrors.licenseSource}
        />
        <Field
          name="ingestSource"
          label="Ingest source"
          value={values.ingestSource}
          onChange={(v) => setField("ingestSource", v)}
          error={fieldErrors.ingestSource}
        />
        <Field
          name="ingestRef"
          label="Ingest ref"
          value={values.ingestRef}
          onChange={(v) => setField("ingestRef", v)}
          error={fieldErrors.ingestRef}
        />
        <Field
          name="isrc"
          label="ISRC"
          value={values.isrc}
          onChange={(v) => setField("isrc", v)}
          error={fieldErrors.isrc}
        />
        <Field
          name="externalId"
          label="External ID"
          value={values.externalId}
          onChange={(v) => setField("externalId", v)}
          error={fieldErrors.externalId}
        />
      </fieldset>

      <fieldset className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-(--text)">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => setField("isActive", e.target.checked)}
            className="h-4 w-4"
          />
          Active (eligible to be sampled into runs)
        </label>
        <label className="flex items-center gap-2 text-sm text-(--text)">
          <input
            type="checkbox"
            checked={values.isBlocked}
            onChange={(e) => setField("isBlocked", e.target.checked)}
            className="h-4 w-4"
          />
          Blocked (removed from catalog)
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <Link
          href="/admin/songs"
          className="text-sm font-medium text-(--text-dim) transition hover:text-(--text)"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error[0]}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioHookEditor } from "@/components/admin/AudioHookEditor";
import { formatHookTime } from "@/components/admin/hook-audio";
import { CoverArt } from "@/components/CoverArt";
import type { SongRow } from "./songs-list";

/**
 * The review surface for one song: listen, place the hook, lock it in.
 *
 * A slide-over rather than a page. Reviewing is a queue — open, judge, lock,
 * next — and a route change per song would throw away the list's scroll
 * position, filters and page on every single one. The drawer keeps the queue
 * behind it and hands the list back the updated row on close, so nothing
 * refetches unless something changed.
 *
 * THE LOCK RULE, as the UI expresses it:
 *
 *   in review  →  everything editable, primary action is "Save & lock"
 *   locked     →  the editor still plays but nothing can move it; the only way
 *                 forward is "Unlock to edit"
 *   draft      →  set aside, off the queue; the only way forward is "Recover to
 *                 review", because a draft can't be locked (see the route)
 *
 * That mirrors PATCH /api/admin/songs/[puzzleId], which refuses a hookStartMs
 * change on a locked song outright. The disabled controls here are a courtesy;
 * the server is the rule.
 *
 * Popularity sits outside that gate on purpose — see the route's header. It is
 * a separate write with its own Save rather than a field on the lock button,
 * because "this is more obscure than its seed says" is a judgment you reach
 * while listening, and it shouldn't have to wait for, or ride along with, a
 * decision about the hook.
 */

type Props = {
  song: SongRow;
  ladder: number[];
  onClose: () => void;
  /// Called with the updated row after any successful write, so the list can
  /// patch itself in place instead of refetching the whole page.
  onSaved: (song: SongRow) => void;
};

type PatchBody = {
  hookStartMs?: number;
  isLocked?: boolean;
  popularity?: number;
  isDraft?: boolean;
};

type SaveKind = "save" | "lock" | "unlock" | "popularity" | "draft" | "recover";

export function SongReviewDrawer({ song, ladder, onClose, onSaved }: Props) {
  const [hookMs, setHookMs] = useState(song.hookStartMs);
  /// Held as a string, not a number: a number field mid-edit is legitimately
  /// empty, and coercing that to 0 would silently propose the most destructive
  /// value on the scale.
  const [popularityDraft, setPopularityDraft] = useState(String(song.popularity));
  const [saving, setSaving] = useState<null | SaveKind | "detect">(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = hookMs !== song.hookStartMs;

  const popularityValue = Number(popularityDraft);
  const popularityValid =
    popularityDraft.trim() !== "" &&
    Number.isInteger(popularityValue) &&
    popularityValue >= 0 &&
    popularityValue <= 100;
  /// Keyed off the raw text so a half-typed or invalid entry still counts as
  /// unsaved work worth warning about on close.
  const popularityTouched = popularityDraft !== String(song.popularity);
  const popularityDirty = popularityValid && popularityValue !== song.popularity;

  const unsaved = dirty || popularityTouched;
  const discardPrompt = dirty
    ? popularityTouched
      ? "Discard the unsaved hook start and popularity?"
      : "Discard the unsaved hook start?"
    : "Discard the unsaved popularity?";

  // Escape closes, but not out from under an in-flight write or unsaved work —
  // losing a hook you just spent two minutes placing to a stray keypress is the
  // one unrecoverable mistake this screen could make.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (saving !== null) return;
      if (unsaved && !window.confirm(discardPrompt)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [discardPrompt, onClose, saving, unsaved]);

  const patch = useCallback(
    async (body: PatchBody, kind: SaveKind): Promise<boolean> => {
      setSaving(kind);
      setError(null);
      try {
        const response = await fetch(`/api/admin/songs/${song.puzzleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await response.json().catch(() => null);

        if (!response.ok) {
          setError(json?.error?.message ?? "Couldn't save.");
          return false;
        }

        onSaved({
          ...song,
          hookStartMs: json.data.hookStartMs,
          hookStartAutoDetected: json.data.hookStartAutoDetected,
          isLocked: json.data.isLocked,
          lockedAt: json.data.lockedAt,
          popularity: json.data.popularity,
          isBlocked: json.data.isBlocked,
        });
        return true;
      } catch {
        setError("Couldn't save — network error.");
        return false;
      } finally {
        setSaving(null);
      }
    },
    [onSaved, song],
  );

  async function handleSave() {
    await patch({ hookStartMs: hookMs }, "save");
  }

  async function handleLock() {
    // Locking closes the drawer, so anything left in the popularity field would
    // go with it. Refuse rather than discard: the number is unusable, but the
    // intent to change it was real.
    if (popularityTouched && !popularityValid) {
      setError("Popularity must be a whole number from 0 to 100 — fix it or reset it.");
      return;
    }

    // One write, not save-then-lock: two requests can half-succeed and leave a
    // song locked around an offset the admin didn't intend.
    const ok = await patch(
      {
        isLocked: true,
        ...(dirty ? { hookStartMs: hookMs } : {}),
        ...(popularityDirty ? { popularity: popularityValue } : {}),
      },
      "lock",
    );
    if (ok) onClose();
  }

  async function handleUnlock() {
    await patch({ isLocked: false }, "unlock");
  }

  // Drafting closes the drawer: the song has just left the review queue, so
  // there is nothing left to do on this screen for it.
  async function handleDraft() {
    const ok = await patch({ isDraft: true }, "draft");
    if (ok) onClose();
  }

  /// Recovery stays open — a song comes back to be worked on, and the editor is
  /// already loaded with its audio.
  async function handleRecover() {
    await patch({ isDraft: false }, "recover");
  }

  async function handleSavePopularity() {
    if (!popularityDirty) return;
    const ok = await patch({ popularity: popularityValue }, "popularity");
    // Normalised so a draft like "07" stops reading as pending work once the 7
    // it means has been written.
    if (ok) setPopularityDraft(String(popularityValue));
  }

  async function handleDetect() {
    setSaving("detect");
    setError(null);
    try {
      const response = await fetch(`/api/admin/songs/${song.puzzleId}/detect-hook`, {
        method: "POST",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Hook detection failed.");
        return;
      }
      setHookMs(json.data.hookStartMs);
      onSaved({ ...song, hookStartMs: json.data.hookStartMs, hookStartAutoDetected: true });
    } catch {
      setError("Hook detection failed — network error.");
    } finally {
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (busy) return;
          if (unsaved && !window.confirm(discardPrompt)) return;
          onClose();
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${song.title}`}
        className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-(--hairline) bg-(--surface) shadow-2xl"
      >
        {/* Header ------------------------------------------------------ */}
        <header className="sticky top-0 z-10 flex items-start gap-4 border-b border-(--hairline) bg-(--surface)/95 px-6 py-4 backdrop-blur">
          <CoverArt title={song.title} artist={song.artist} album={song.album} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
                {song.title}
              </h2>
              <StatusPill song={song} />
            </div>
            <p className="truncate text-sm text-(--text-dim)">
              {song.artist}
              {song.album ? ` · ${song.album}` : ""}
              {song.movie ? ` · ${song.movie}` : ""}
            </p>
            {/* Popularity used to be shown here. It is editable now, and lives
                in its own section below — a static copy up here would sit and
                disagree with the field while an edit was in progress. */}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-(--text-faint)">
              {song.externalId && (
                <a
                  href={`https://www.youtube.com/watch?v=${song.externalId}&t=${Math.floor(hookMs / 1000)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted hover:text-violet-500"
                >
                  Open on YouTube
                </a>
              )}
              {song.lockedAt && <span>Locked {new Date(song.lockedAt).toLocaleDateString()}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              if (unsaved && !window.confirm(discardPrompt)) return;
              onClose();
            }}
            aria-label="Close"
            className="shrink-0 rounded-lg p-2 text-(--text-faint) transition hover:bg-(--surface-hover) hover:text-(--text)"
          >
            ✕
          </button>
        </header>

        {/* Body -------------------------------------------------------- */}
        <div className="flex flex-1 flex-col gap-4 p-6">
          {song.isBlocked && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-(--text-dim)">
              <span className="font-medium text-amber-600 dark:text-amber-400">Draft.</span> This
              song is set aside — never sampled into a run and never offered by the guess
              typeahead. Nothing about it has been deleted; recover it to put it back in the review
              queue.
            </div>
          )}

          {song.isLocked && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-(--text-dim)">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Locked.</span>{" "}
              This song is in rotation and its hook can&apos;t be moved. Unlock to edit — it drops
              out of rotation while unlocked.
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}

          <AudioHookEditor
            puzzleId={song.puzzleId}
            videoId={song.externalId}
            hookStartMs={hookMs}
            onHookStartMsChange={setHookMs}
            // A draft is read-only for the same reason a lock is, from the other
            // direction: its footer offers no way to save a hook, so an editable
            // waveform would only invite work that gets thrown away.
            readOnly={song.isLocked || song.isBlocked}
            ladder={ladder}
          />

          {!song.isLocked && !song.isBlocked && song.externalId && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDetect}
                disabled={busy}
                className="rounded-lg border border-(--hairline) px-3 py-1.5 text-xs font-medium text-(--text-dim) transition hover:border-amber-500 hover:text-amber-500 disabled:cursor-wait disabled:opacity-50"
              >
                {saving === "detect" ? "Detecting…" : "⏱ Auto-detect first sound"}
              </button>
              <p className="text-xs text-(--text-faint)">
                Server-side silence detection. A starting point — always listen before locking.
              </p>
            </div>
          )}

          <section className="rounded-xl border border-(--hairline) px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-medium text-(--text)">Popularity</h3>
              <p className="font-mono text-xs tabular-nums">
                {popularityDirty ? (
                  <span className="text-amber-500">
                    Unsaved · {song.popularity} → {popularityValue}
                  </span>
                ) : (
                  <span className="text-(--text-faint)">{song.popularity}</span>
                )}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-(--text-faint)">
              0–100. Decides which difficulty band this song is sampled into. Editable whether or
              not the song is locked — the lock guards the hook, not this. The seed value stays as
              ingested.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={popularityValid ? popularityValue : song.popularity}
                disabled={busy}
                aria-label="Popularity"
                onChange={(e) => setPopularityDraft(e.target.value)}
                className="h-1.5 min-w-40 flex-1 cursor-pointer accent-violet-500 disabled:cursor-wait"
              />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={popularityDraft}
                disabled={busy}
                aria-label="Popularity value"
                onChange={(e) => setPopularityDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void handleSavePopularity();
                }}
                className="w-20 rounded-lg border border-(--hairline) bg-(--surface-strong) px-2.5 py-1.5 text-sm tabular-nums text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
              <button
                type="button"
                onClick={() => void handleSavePopularity()}
                disabled={busy || !popularityDirty}
                className="rounded-lg border border-(--hairline) px-3 py-1.5 text-xs font-medium text-(--text-dim) transition hover:bg-(--surface-hover) disabled:opacity-40"
              >
                {saving === "popularity" ? "Saving…" : "Save popularity"}
              </button>
              {popularityTouched && (
                <button
                  type="button"
                  onClick={() => setPopularityDraft(String(song.popularity))}
                  disabled={busy}
                  className="text-xs text-(--text-faint) underline decoration-dotted transition hover:text-(--text) disabled:opacity-40"
                >
                  Reset
                </button>
              )}
            </div>

            {popularityTouched && !popularityValid && (
              <p className="mt-2 text-xs text-red-500">Enter a whole number from 0 to 100.</p>
            )}
          </section>
        </div>

        {/* Footer ------------------------------------------------------ */}
        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-(--hairline) bg-(--surface)/95 px-6 py-4 backdrop-blur">
          <p className="font-mono text-xs text-(--text-faint)">
            {dirty ? (
              <span className="text-amber-500">
                Unsaved · {formatHookTime(song.hookStartMs)} → {formatHookTime(hookMs)}
              </span>
            ) : (
              <>Hook at {formatHookTime(hookMs)}</>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {song.isBlocked ? (
              <button
                type="button"
                onClick={handleRecover}
                disabled={busy}
                title="Put this song back in the review queue"
                className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {saving === "recover" ? "Recovering…" : "↩ Recover to review"}
              </button>
            ) : song.isLocked ? (
              <button
                type="button"
                onClick={handleUnlock}
                disabled={busy}
                className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-600 transition hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-400"
              >
                {saving === "unlock" ? "Unlocking…" : "🔓 Unlock to edit"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDraft}
                  disabled={busy}
                  title="Set this song aside — reversible, nothing is deleted"
                  className="rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-faint) transition hover:border-amber-500 hover:text-amber-500 disabled:opacity-40"
                >
                  {saving === "draft" ? "Drafting…" : "Draft"}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !dirty}
                  className="rounded-lg border border-(--hairline) px-4 py-2 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover) disabled:opacity-40"
                >
                  {saving === "save" ? "Saving…" : "Save, keep in review"}
                </button>
                <button
                  type="button"
                  onClick={handleLock}
                  disabled={busy || !song.externalId}
                  title={
                    song.externalId
                      ? "Save this hook start and put the song into rotation"
                      : "Needs a YouTube video id before it can be locked"
                  }
                  className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {saving === "lock" ? "Locking…" : "🔒 Save & lock"}
                </button>
              </>
            )}
          </div>
        </footer>
      </aside>
    </div>
  );
}

function StatusPill({ song }: { song: SongRow }) {
  if (song.isBlocked) {
    return (
      <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        Draft
      </span>
    );
  }
  return song.isLocked ? (
    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      Locked
    </span>
  ) : (
    <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
      In review
    </span>
  );
}

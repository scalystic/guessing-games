"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import axios from "axios";
import type { YoutubeVideoItem } from "@/app/api/admin/youtube/playlist/route";

type Props = {
  onImported: () => void;
};

type VideoRow = YoutubeVideoItem & {
  editedTitle: string;
  editedArtist: string;
  selected: boolean;
};

type ImportStatus =
  | "idle"
  | "pending"
  | "done"
  /// Imported, but iTunes had no match — year, genre, album and duration are
  /// missing and the names came from the video title.
  | "no_itunes"
  /// Imported off a weak iTunes match; the names are worth an eye.
  | "low_confidence"
  | "already_exists"
  | "stopped"
  | "error";

type ImportResult = {
  videoId: string;
  status: ImportStatus;
  error?: string;
  /// What actually landed in the catalog. iTunes' canonical names usually
  /// differ from the video title, so showing the video title here would
  /// misreport what was saved.
  savedTitle?: string;
  savedArtist?: string;
};

type Step = "url" | "select" | "importing" | "done";

function formatDuration(ms: number | null): string {
  if (!ms) return "–";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ImportYoutubeModal({ onImported }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("url");

  // Step 1 state
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();

  // Step 2 state
  const [videos, setVideos] = useState<VideoRow[]>([]);

  // Step 3 state
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const cancelRef = useRef(false);
  // Holds the AbortController for the currently in-flight axios request so
  // Stop Import can kill it immediately rather than waiting for it to finish.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Drag-to-select
  const isDragging = useRef(false);
  const dragAction = useRef<boolean>(true);

  useEffect(() => {
    const stop = () => { isDragging.current = false; };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  function handleRowMouseDown(videoId: string, currentSelected: boolean) {
    const newState = !currentSelected;
    isDragging.current = true;
    dragAction.current = newState;
    setVideos((prev) =>
      prev.map((v) => (v.videoId === videoId ? { ...v, selected: newState } : v))
    );
  }

  function handleRowMouseEnter(videoId: string, currentSelected: boolean) {
    if (!isDragging.current) return;
    if (currentSelected === dragAction.current) return;
    setVideos((prev) =>
      prev.map((v) => (v.videoId === videoId ? { ...v, selected: dragAction.current } : v))
    );
  }

  function reset() {
    setStep("url");
    setPlaylistUrl("");
    setPreviewError(null);
    setVideos([]);
    setImportResults([]);
    setIsImporting(false);
    abortControllerRef.current = null;
  }

  function close() {
    if (isImporting) return;
    setIsOpen(false);
    reset();
  }

  function handlePreview() {
    if (!playlistUrl.trim()) {
      setPreviewError("Enter a playlist URL first.");
      return;
    }
    setPreviewError(null);

    startPreview(async () => {
      try {
        const res = await axios.get("/api/admin/youtube/playlist", {
          params: { url: playlistUrl.trim() },
        });
        const items = res.data.data.items as YoutubeVideoItem[];
        setVideos(
          items.map((item) => ({
            ...item,
            editedTitle: item.title,
            editedArtist: item.channelTitle,
            // Auto-deselect songs already in the catalog — admin can still
            // manually check them if they want to force a re-import.
            selected: !item.existsInDb,
          }))
        );
        setStep("select");
      } catch (error) {
        if (axios.isAxiosError(error)) {
          setPreviewError(
            error.response?.data?.error?.message ?? "Failed to fetch playlist."
          );
        } else {
          setPreviewError("Network error — please try again.");
        }
      }
    });
  }

  function toggleAll(checked: boolean) {
    setVideos((prev) => prev.map((v) => ({ ...v, selected: checked })));
  }

  function updateField(
    videoId: string,
    field: "editedTitle" | "editedArtist",
    value: string
  ) {
    setVideos((prev) =>
      prev.map((v) => (v.videoId === videoId ? { ...v, [field]: value } : v))
    );
  }

  async function handleImport() {
    const selected = videos.filter((v) => v.selected);
    if (selected.length === 0) return;

    cancelRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const results: ImportResult[] = selected.map((v) => ({
      videoId: v.videoId,
      status: "idle",
    }));
    setImportResults(results);
    setStep("importing");
    setIsImporting(true);

    for (let i = 0; i < selected.length; i++) {
      if (cancelRef.current) {
        // Mark every still-queued item as stopped so the list is honest.
        setImportResults((prev) =>
          prev.map((r) => (r.status === "idle" ? { ...r, status: "stopped" } : r))
        );
        break;
      }

      const video = selected[i]!;

      // Skip songs already in the catalog — mark immediately, no API call.
      if (video.existsInDb) {
        setImportResults((prev) =>
          prev.map((r) =>
            r.videoId === video.videoId ? { ...r, status: "already_exists" } : r
          )
        );
        continue;
      }

      setImportResults((prev) =>
        prev.map((r) => (r.videoId === video.videoId ? { ...r, status: "pending" } : r))
      );

      try {
        const res = await axios.post(
          "/api/admin/youtube/import",
          {
            videoId: video.videoId,
            title: video.editedTitle || video.title,
            artist: video.editedArtist || video.channelTitle,
            seedPopularity: 80,
            thumbnailUrl: video.thumbnailUrl || undefined,
          },
          { signal: controller.signal },
        );
        const data = res.data?.data ?? {};
        const alreadyExists = data.alreadyExists === true;
        const itunes = data.itunes as { matched?: boolean; lowConfidence?: boolean } | undefined;

        const status: ImportStatus = alreadyExists
          ? "already_exists"
          : itunes?.matched === false
            ? "no_itunes"
            : itunes?.lowConfidence
              ? "low_confidence"
              : "done";

        setImportResults((prev) =>
          prev.map((r) =>
            r.videoId === video.videoId
              ? { ...r, status, savedTitle: data.title, savedArtist: data.artist }
              : r
          )
        );
      } catch (error) {
        // axios throws a CanceledError when the AbortController fires.
        if (axios.isCancel(error)) {
          setImportResults((prev) =>
            prev.map((r) =>
              r.videoId === video.videoId ? { ...r, status: "stopped" } : r
            )
          );
          // cancelRef is already true (set by handleCancel) — the next loop
          // iteration will mark remaining idle items and break.
          continue;
        }
        const msg = axios.isAxiosError(error)
          ? (error.response?.data?.error?.message ?? "Import failed.")
          : "Import failed.";
        setImportResults((prev) =>
          prev.map((r) =>
            r.videoId === video.videoId ? { ...r, status: "error", error: msg } : r
          )
        );
      }
    }

    abortControllerRef.current = null;
    setIsImporting(false);
    setStep("done");
    onImported();
  }

  function handleCancel() {
    cancelRef.current = true;
    // Immediately abort the in-flight request — the catch block handles the rest.
    abortControllerRef.current?.abort();
  }

  const selectedCount = videos.filter((v) => v.selected).length;
  const allSelected = videos.length > 0 && videos.every((v) => v.selected);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-(--hairline) bg-(--surface-strong) px-4 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
      >
        <span className="text-base leading-none">▶</span>
        Import from YouTube
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-(--scrim) p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-2xl flex-col rounded-2xl border border-(--hairline) bg-(--surface-strong)"
            style={{ maxHeight: "90vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-(--hairline) px-6 py-4">
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg font-bold text-(--text)">
                  Import from YouTube Playlist
                </p>
                <p className="mt-0.5 text-xs text-(--text-dim)">
                  {step === "url" && "Paste a YouTube playlist URL to preview its songs."}
                  {step === "select" && `${videos.length} songs found — review details and select which to import.`}
                  {step === "importing" && "Saving songs to catalog…"}
                  {step === "done" && (() => {
                    const count = (...statuses: ImportStatus[]) =>
                      importResults.filter((r) => statuses.includes(r.status)).length;
                    const done = count("done", "no_itunes", "low_confidence");
                    const noItunes = count("no_itunes");
                    const lowConfidence = count("low_confidence");
                    const alreadyExists = count("already_exists");
                    const stopped = count("stopped");
                    const failed = count("error");
                    const wasStopped = stopped > 0;
                    const parts = [`${done} added`];
                    if (alreadyExists > 0) parts.push(`${alreadyExists} already in catalog`);
                    if (noItunes > 0) parts.push(`${noItunes} without iTunes data`);
                    if (lowConfidence > 0) parts.push(`${lowConfidence} to double-check`);
                    if (failed > 0) parts.push(`${failed} failed`);
                    if (stopped > 0) parts.push(`${stopped} cancelled`);
                    return `${wasStopped ? "Import stopped" : "Import complete"} — ${parts.join(", ")}.`;
                  })()}
                </p>
              </div>
              {!isImporting && (
                <button
                  type="button"
                  onClick={close}
                  className="ml-4 text-sm font-medium text-(--text-dim) transition hover:text-(--text)"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {/* ── Step 1: URL Input ── */}
              {step === "url" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-(--text)">Playlist URL</label>
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/playlist?list=PL…"
                      value={playlistUrl}
                      onChange={(e) => setPlaylistUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                      className="rounded-lg border border-(--hairline) bg-(--surface) px-3.5 py-2.5 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                    />
                    <p className="text-xs text-(--text-faint)">
                      Requires <code>YOUTUBE_API_KEY</code> in your .env file.
                    </p>
                  </div>

                  {previewError && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
                      {previewError}
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 2: Video Selection ── */}
              {step === "select" && (
                <div className="flex flex-col gap-3">
                  {(() => {
                    const existingCount = videos.filter((v) => v.existsInDb).length;
                    return existingCount > 0 ? (
                      <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/8 px-3 py-2.5 text-xs text-blue-400">
                        <span className="shrink-0 text-base leading-none">ℹ</span>
                        <span>
                          <strong>{existingCount}</strong> song{existingCount !== 1 ? "s are" : " is"} already in your catalog and have been auto-deselected. Check them manually to force a re-import.
                        </span>
                      </div>
                    ) : null;
                  })()}

                  <div className="flex items-center justify-between border-b border-(--hairline) pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="h-4 w-4 rounded border-(--hairline) accent-violet-600"
                      />
                      <span className="text-sm text-(--text-dim)">
                        Select all ({videos.length})
                      </span>
                    </label>
                    <p className="max-w-xs text-right text-xs text-(--text-faint)">
                      iTunes supplies the clean title, artist, year, genre &amp; duration; hook start is auto-detected from the audio. A song iTunes doesn&apos;t know is still imported, using the video title.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 select-none">
                    {videos.map((video) => (
                      <div
                        key={video.videoId}
                        onMouseDown={(e) => {
                          if ((e.target as HTMLElement).tagName === "INPUT" &&
                              (e.target as HTMLInputElement).type !== "checkbox") return;
                          e.preventDefault();
                          handleRowMouseDown(video.videoId, video.selected);
                        }}
                        onMouseEnter={() => handleRowMouseEnter(video.videoId, video.selected)}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                          video.selected
                            ? "border-violet-500/40 bg-violet-500/5"
                            : "border-(--hairline) opacity-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={video.selected}
                          onChange={() => {}}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-(--hairline) accent-violet-600 pointer-events-none"
                        />
                        {video.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          {/* Row 1: Title + Artist */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={video.editedTitle}
                              onChange={(e) => updateField(video.videoId, "editedTitle", e.target.value)}
                              onMouseDown={(e) => e.stopPropagation()}
                              placeholder="Song title"
                              className="min-w-0 flex-1 cursor-text select-text rounded-md border border-(--hairline) bg-(--surface) px-2.5 py-1.5 text-sm text-(--text) outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
                            />
                            <input
                              type="text"
                              value={video.editedArtist}
                              onChange={(e) => updateField(video.videoId, "editedArtist", e.target.value)}
                              onMouseDown={(e) => e.stopPropagation()}
                              placeholder="Artist"
                              className="min-w-0 flex-1 cursor-text select-text rounded-md border border-(--hairline) bg-(--surface) px-2.5 py-1.5 text-sm text-(--text-dim) outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
                            />
                          </div>
                          {/* Duration + catalog status */}
                          <div className="flex items-center gap-2">
                            {video.durationMs && (
                              <p className="text-xs text-(--text-faint)">
                                {formatDuration(video.durationMs)} · hook start auto-detected on import
                              </p>
                            )}
                            {video.existsInDb && (
                              <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
                                Already in catalog
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 3: Import Progress ── */}
              {(step === "importing" || step === "done") && (
                <div className="flex flex-col gap-2">
                  {importResults.map((result) => {
                    const video = videos.find((v) => v.videoId === result.videoId)!;
                    return (
                      <div
                        key={result.videoId}
                        className="flex items-center gap-3 rounded-xl border border-(--hairline) p-3"
                      >
                        {video.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-(--text)">
                            {result.savedTitle || video.editedTitle || video.title}
                          </p>
                          <p className="truncate text-xs text-(--text-dim)">
                            {result.savedArtist || video.editedArtist || video.channelTitle}
                          </p>
                          {result.status === "error" && result.error && (
                            <p className="mt-0.5 text-xs text-red-500">{result.error}</p>
                          )}
                        </div>
                        <StatusBadge status={result.status} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-(--hairline) px-6 py-4">
              {step === "url" && (
                <>
                  <button
                    type="button"
                    onClick={close}
                    className="text-sm font-medium text-(--text-dim) transition hover:text-(--text)"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={isPreviewing || !playlistUrl.trim()}
                    className="flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPreviewing ? "Loading…" : "Preview playlist"}
                  </button>
                </>
              )}

              {step === "select" && (
                <>
                  <button
                    type="button"
                    onClick={() => setStep("url")}
                    className="text-sm font-medium text-(--text-dim) transition hover:text-(--text)"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={selectedCount === 0}
                    className="flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Import {selectedCount} song{selectedCount !== 1 ? "s" : ""}
                  </button>
                </>
              )}

              {step === "importing" && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={!isImporting}
                  className="flex h-10 items-center justify-center rounded-lg border border-red-500/40 px-5 text-sm font-medium text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Stop import
                </button>
              )}

              {step === "done" && (
                <button
                  type="button"
                  onClick={close}
                  className="flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-fuchsia-500"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: ImportStatus }) {
  if (status === "idle") {
    return <span className="shrink-0 text-xs text-(--text-faint)">Queued</span>;
  }
  if (status === "pending") {
    return (
      <span className="shrink-0 animate-pulse text-xs font-medium text-violet-500">
        Matching &amp; analyzing…
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        ✓ Imported
      </span>
    );
  }
  if (status === "no_itunes") {
    return (
      <span className="shrink-0 text-xs font-medium text-amber-500 dark:text-amber-400">
        ✓ Imported — no iTunes data
      </span>
    );
  }
  if (status === "low_confidence") {
    return (
      <span className="shrink-0 text-xs font-medium text-amber-500 dark:text-amber-400">
        ✓ Imported — check names
      </span>
    );
  }
  if (status === "already_exists") {
    return (
      <span className="shrink-0 text-xs font-medium text-blue-400">
        Already in catalog
      </span>
    );
  }
  if (status === "stopped") {
    return (
      <span className="shrink-0 text-xs font-medium text-(--text-faint)">
        ✕ Cancelled
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs font-medium text-red-500">
      ✗ Failed
    </span>
  );
}

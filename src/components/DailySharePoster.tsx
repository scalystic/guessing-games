"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/site";

type Props = {
  dayKey: string;
  /// Today's leaderboard position and field size. Null while the board is
  /// still loading, or when this player has no entry on it.
  rank: number | null;
  totalPlayers: number | null;
  /// Songs in today's challenge, and how many the player named.
  roundCount: number;
  roundsSolved: number;
  /// Songs named on the first listen — the opening window of the reveal
  /// ladder, with nothing unlocked yet.
  instantSolves: number;
  /// That opening window, so the label states the real number instead of a
  /// hardcoded "0.4".
  firstRevealMs: number;
  score: number;
};

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1350;

/// Where a shared poster or invite sends people.
///
/// /sargam, not the /play/daily this used to print: the daily challenge is the
/// game now, and it lives on the game's own URL. /play/daily still 307s here,
/// so posters already out in the world keep working — but a link printed onto
/// an image is the last place you want a redirect hop, and this is also the
/// shorter string to read off a screenshot.
const DAILY_PATH = "/sargam";

function posterDay(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function revealLabel(milliseconds: number) {
  const seconds = milliseconds / 1000;
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function trackedWidth(context: CanvasRenderingContext2D, text: string, tracking: number) {
  return context.measureText(text).width + tracking * Math.max(0, text.length - 1);
}

function drawTrackingText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "right" = "left",
) {
  let cursor = align === "right" ? x - trackedWidth(context, text, tracking) : x;
  for (const character of text) {
    context.fillText(character, cursor, y);
    cursor += context.measureText(character).width + tracking;
  }
}

/// The four numbers the poster reports, in print order. Derived once so the
/// canvas and the on-screen preview can't drift apart.
function posterRows(props: Props): { label: string; value: string; accent: boolean }[] {
  return [
    { label: "TOTAL SONGS", value: String(props.roundCount), accent: false },
    { label: "SONGS GUESSED", value: String(props.roundsSolved), accent: true },
    {
      label: `GUESSED IN ${revealLabel(props.firstRevealMs)} SECONDS`,
      value: String(props.instantSolves),
      accent: true,
    },
  ];
}

async function renderPoster(props: Props): Promise<Blob> {
  const { dayKey, rank, totalPlayers, roundCount, roundsSolved, score } = props;

  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Poster canvas is unavailable.");

  const navy = "#151a2b";
  const deepNavy = "#090c15";
  const warmWhite = "#f4ecdd";
  const muted = "#939aae";
  const line = "#343b51";
  const amber = "#f2b84b";

  context.fillStyle = navy;
  context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const glow = context.createRadialGradient(905, 120, 0, 905, 120, 560);
  glow.addColorStop(0, "rgba(242,184,75,0.18)");
  glow.addColorStop(1, "rgba(242,184,75,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  context.fillStyle = amber;
  context.fillRect(82, 76, 9, 78);
  context.fillStyle = warmWhite;
  context.font = '700 54px "Fraunces", Georgia, serif';
  context.fillText("SARGAM", 116, 128);
  context.fillStyle = muted;
  context.font = '600 17px "Geist Mono", monospace';
  drawTrackingText(context, "DAILY SIGNAL", 118, 158, 4.5);

  context.textAlign = "right";
  context.fillStyle = warmWhite;
  context.font = '600 22px "Instrument Sans", sans-serif';
  context.fillText(posterDay(dayKey), 996, 115);
  context.fillStyle = muted;
  context.font = '500 16px "Geist Mono", monospace';
  context.fillText("SAME SONGS. ONE DAY.", 996, 148);
  context.textAlign = "left";

  context.strokeStyle = line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(82, 205);
  context.lineTo(998, 205);
  context.stroke();

  context.fillStyle = warmWhite;
  context.font = '600 58px "Fraunces", Georgia, serif';
  context.fillText(roundsSolved === roundCount ? "Every signal found." : "Today’s frequency report.", 82, 278);

  // Rank is the headline number — it's the one figure that only means
  // something next to everyone else who played today. Score sits opposite it
  // on the same baseline, both captions on one line.
  const statBaseline = 448;
  const labelBaseline = 492;

  context.fillStyle = amber;
  context.font = '700 168px "Fraunces", Georgia, serif';
  const rankText = rank === null ? "—" : `#${rank}`;
  context.fillText(rankText, 78, statBaseline);
  if (rank !== null && totalPlayers !== null) {
    const rankWidth = context.measureText(rankText).width;
    context.fillStyle = muted;
    context.font = '500 52px "Fraunces", Georgia, serif';
    context.fillText(`of ${totalPlayers.toLocaleString("en-IN")}`, 118 + rankWidth, statBaseline);
  }

  context.fillStyle = warmWhite;
  context.font = '700 84px "Fraunces", Georgia, serif';
  context.textAlign = "right";
  context.fillText(score.toLocaleString("en-IN"), 998, statBaseline);
  context.textAlign = "left";

  context.fillStyle = muted;
  context.font = '600 17px "Geist Mono", monospace';
  drawTrackingText(context, "TODAY’S RANK", 86, labelBaseline, 4);
  drawTrackingText(context, "TOTAL SCORE", 998, labelBaseline, 4, "right");

  // Report card: one row per number, label left, figure right. No lamps, no
  // colour-coded dots — the rows say what they mean in words.
  const cardTop = 540;
  const cardHeight = 470;
  roundedRect(context, 82, cardTop, 916, cardHeight, 30);
  context.fillStyle = deepNavy;
  context.fill();
  context.strokeStyle = line;
  context.stroke();

  const rows = posterRows(props);
  const rowHeight = cardHeight / rows.length;

  rows.forEach((row, index) => {
    const centerY = cardTop + rowHeight * index + rowHeight / 2;

    context.fillStyle = muted;
    context.font = '600 19px "Geist Mono", monospace';
    drawTrackingText(context, row.label, 126, centerY + 7, 4);

    context.fillStyle = row.accent ? amber : warmWhite;
    context.font = '700 68px "Fraunces", Georgia, serif';
    context.textAlign = "right";
    context.fillText(row.value, 954, centerY + 24);
    context.textAlign = "left";

    if (index < rows.length - 1) {
      context.beginPath();
      context.moveTo(126, cardTop + rowHeight * (index + 1));
      context.lineTo(954, cardTop + rowHeight * (index + 1));
      context.strokeStyle = "rgba(52,59,81,0.58)";
      context.lineWidth = 1;
      context.stroke();
    }
  });

  roundedRect(context, 82, 1090, 916, 168, 28);
  context.fillStyle = amber;
  context.fill();

  context.fillStyle = "rgba(36,23,6,0.62)";
  context.font = '600 16px "Geist Mono", monospace';
  drawTrackingText(context, "PLAY THE DAILY CHALLENGE", 126, 1140, 2.5);
  context.fillStyle = "#241706";
  context.font = '700 34px "Instrument Sans", sans-serif';
  context.fillText("Can you catch today’s songs?", 126, 1182);
  context.font = '600 20px "Geist Mono", monospace';
  drawTrackingText(context, `${new URL(SITE_URL).host}${DAILY_PATH}`, 126, 1218, 1.5);

  // Drawn play button rather than the "▶" glyph, which rendered as whatever
  // fallback font the device happened to have.
  context.beginPath();
  context.arc(902, 1174, 46, 0, Math.PI * 2);
  context.fillStyle = "#241706";
  context.fill();
  context.beginPath();
  context.moveTo(890, 1152);
  context.lineTo(890, 1196);
  context.lineTo(926, 1174);
  context.closePath();
  context.fillStyle = amber;
  context.fill();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Poster image could not be created."));
    }, "image/png");
  });
}

function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="15" cy="4" r="2.25" />
      <circle cx="5" cy="10" r="2.25" />
      <circle cx="15" cy="16" r="2.25" />
      <path d="M7 9l5.9-3.6M7 11l5.9 3.6" />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 16.5c.6-3 2.8-4.6 5.5-4.6 1 0 1.9.2 2.7.6" />
      <path d="M15 11.5v5M12.5 14h5" />
    </svg>
  );
}

/// The poster the share button hands over, rendered on screen so the player
/// sees what they are about to send. Same numbers as the canvas, via
/// posterRows() — the two can’t drift.
function PosterPreview(props: Props) {
  const perfect = props.roundsSolved === props.roundCount;
  const rows = posterRows(props);

  return (
    <div className="overflow-hidden rounded-[24px] border border-[#343b51] bg-[#151a2b] text-left text-[#f4ecdd] shadow-[0_30px_70px_-38px_rgba(9,12,21,0.9)]">
      <div className="relative aspect-4/5 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#f2b84b]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-[#343b51] pb-5">
            <div className="border-l-[5px] border-[#f2b84b] pl-3">
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold leading-none tracking-[-0.02em]">Sargam</p>
              <p className="mt-1 font-mono text-[8px] font-semibold uppercase tracking-[0.25em] text-[#a2a8b8]">Daily signal</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold">{posterDay(props.dayKey)}</p>
              <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.16em] text-[#939aae]">Same songs. One day.</p>
            </div>
          </header>

          <div className="py-4 sm:py-5">
            <p id="share-result-title" className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight sm:text-2xl">
              {perfect ? "Every signal found." : "Today’s frequency report."}
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="font-[family-name:var(--font-display)] text-6xl font-bold leading-none tracking-[-0.06em] text-[#f2b84b] sm:text-7xl">
                {props.rank === null ? "—" : `#${props.rank}`}
                {props.rank !== null && props.totalPlayers !== null ? (
                  <span className="ml-2 text-xl font-medium tracking-normal text-[#939aae] sm:text-2xl">
                    of {props.totalPlayers.toLocaleString("en-IN")}
                  </span>
                ) : null}
              </p>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none tabular-nums sm:text-4xl">
                {props.score.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-4 font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-[#939aae]">
              <span>Today’s rank</span>
              <span>Total score</span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border border-[#343b51] bg-[#090c15] px-4">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex flex-1 items-center justify-between gap-3 border-b border-[#343b51]/60 last:border-0"
              >
                <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-[#939aae]">
                  {row.label}
                </span>
                <span
                  className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none tabular-nums sm:text-4xl"
                  style={{ color: row.accent ? "#f2b84b" : "#f4ecdd" }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-[#f2b84b] px-4 py-3 text-[#241706]">
            <div>
              <p className="font-mono text-[7px] font-semibold uppercase tracking-[0.14em] text-[#241706]/60">
                Play the daily challenge
              </p>
              <p className="mt-0.5 text-sm font-bold">Can you catch today’s songs?</p>
              <p className="mt-0.5 font-mono text-[7px] font-semibold tracking-[0.06em]">
                {new URL(SITE_URL).host}{DAILY_PATH}
              </p>
            </div>
            {/* Drawn, not the "▶" glyph — that rendered as whatever fallback
                font the device had. */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#241706]" aria-hidden="true">
              <svg width="12" height="14" viewBox="0 0 12 14" fill="#f2b84b" aria-hidden="true">
                <path d="M0 0l12 7-12 7z" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DailySharePoster(props: Props) {
  const [status, setStatus] = useState<string | null>(null);
  /// The preview card is the poster the share button hands over, so there's no
  /// reason to print it on the completion screen before anyone asks for it.
  /// Pressing Share reveals it — on desktop, where the browser can only drop a
  /// PNG in the downloads folder, that reveal is the only confirmation of what
  /// was just saved.
  const [posterVisible, setPosterVisible] = useState(false);

  async function posterFile() {
    const blob = await renderPoster(props);
    return new File([blob], `sargam-daily-${props.dayKey}.png`, { type: "image/png" });
  }

  /// Kept as the no-Web-Share fallback for the share button — there's no
  /// download button on the card any more, but a desktop browser that can't
  /// share a file still has to hand the poster over somehow.
  function download(file: File) {
    const href = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function handleShare() {
    setPosterVisible(true);
    setStatus("Preparing your poster…");
    const shareUrl = `${window.location.origin}${DAILY_PATH}`;
    const caption = `I found ${props.roundsSolved}/${props.roundCount} songs and scored ${props.score.toLocaleString("en-IN")} in today's Sargam Daily. Can you beat it?\n${shareUrl}`;

    try {
      const file = await posterFile();
      const fileShare = { files: [file], title: "My Sargam Daily result", text: caption };

      if (navigator.share && navigator.canShare?.(fileShare)) {
        await navigator.share(fileShare);
        setStatus("Poster shared.");
      } else if (navigator.share) {
        await navigator.share({ title: "My Sargam Daily result", text: caption, url: shareUrl });
        download(file);
        setStatus("Link shared. Poster saved.");
      } else {
        download(file);
        try {
          await navigator.clipboard.writeText(caption);
          setStatus("Caption copied and poster saved.");
        } catch {
          setStatus("Poster saved. Copy the play link from the card.");
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus(null);
        return;
      }
      setStatus("Couldn’t share automatically. Try again.");
    }
  }

  /// Invite is the link on its own — no result, no image. It's for pulling
  /// someone into today's challenge, not for showing them how you did.
  async function handleInvite() {
    const shareUrl = `${window.location.origin}${DAILY_PATH}`;
    const text = `Today's Sargam daily challenge — ${props.roundCount} songs, fifteen seconds each. Think you can beat me?`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Sargam Daily Challenge", text, url: shareUrl });
        setStatus("Invite sent.");
      } else {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
        setStatus("Invite link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus(null);
        return;
      }
      setStatus("Couldn’t open the invite. Copy the link from the card.");
    }
  }

  return (
    <section className="w-full max-w-[460px]" aria-label="Share today’s result">
      {posterVisible ? <PosterPreview {...props} /> : null}

      <div className={`grid grid-cols-2 gap-2 ${posterVisible ? "mt-4" : ""}`}>
        <button
          type="button"
          onClick={() => void handleShare()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-(--signal) px-4 text-sm font-bold text-(--signal-ink) transition-colors enabled:hover:bg-[#ffd071]"
        >
          <ShareIcon />
          Share result
        </button>
        <button
          type="button"
          onClick={() => void handleInvite()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-(--hairline) bg-(--surface) px-4 text-sm font-semibold text-(--text-dim) transition-colors hover:bg-(--surface-hover) hover:text-(--text)"
        >
          <InviteIcon />
          Invite friends
        </button>
      </div>
      <p className="mt-2 min-h-5 text-center text-xs text-(--text-dim)" role="status" aria-live="polite">
        {status ?? "The poster hides song titles so it’s safe to share."}
      </p>
    </section>
  );
}

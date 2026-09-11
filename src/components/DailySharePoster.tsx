"use client";

import { useEffect, useState } from "react";
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

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 4.5H5.5a2 2 0 0 0-2 2V13" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M3 6l7 5 7-5" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3v9" />
      <path d="M6.5 8.5L10 12l3.5-3.5" />
      <path d="M3.5 14v1.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V14" />
    </svg>
  );
}

/// Web intents carry text and a link — never a file. So the app picker shares
/// the caption plus the play link, and the poster image stays on screen for
/// anyone who wants to save it deliberately.
type ShareTarget = {
  name: string;
  /// The official mark, in brand colour on a white disc. Several of these paths
  /// (Telegram, Facebook, Reddit) are a filled disc with the glyph knocked out
  /// of it, so they need a light tile behind them to read — which is also how
  /// each brand draws its own icon.
  ///
  /// Paths are the 24×24 marks from simple-icons (CC0), unmodified — except
  /// LinkedIn, which simple-icons no longer ships; that one is the 16×16 mark
  /// from Bootstrap Icons (MIT), hence the per-target viewBox.
  brand: string;
  path: string;
  viewBox?: string;
  href: (caption: string, url: string) => string;
};

const SHARE_TARGETS: ShareTarget[] = [
  {
    name: "WhatsApp",
    brand: "#25D366",
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
    href: (caption) => `https://wa.me/?text=${encodeURIComponent(caption)}`,
  },
  {
    name: "X",
    brand: "#0f1117",
    path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
    href: (caption, url) =>
      `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`,
  },
  {
    name: "Telegram",
    brand: "#229ED9",
    path: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
    href: (caption, url) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(caption)}`,
  },
  {
    name: "Facebook",
    brand: "#1877F2",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
    href: (_caption, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: "LinkedIn",
    brand: "#0A66C2",
    viewBox: "0 0 16 16",
    path: "M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z",
    /// Link only — LinkedIn dropped prefilled text from share-offsite, so the
    /// caption can't ride along and the poster stays an explicit save.
    href: (_caption, url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Reddit",
    brand: "#FF4500",
    path: "M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z",
    href: (caption, url) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(caption)}`,
  },
];

/// The picker shown when the browser has no native share sheet of its own —
/// desktop Chrome and Firefox, mostly. Pressing Share used to drop a PNG in the
/// downloads folder there, which reads as a failure rather than a share.
function ShareSheet(props: {
  caption: string;
  url: string;
  onCopy: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { onClose } = props;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function open(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
    props.onClose();
  }

  const mailHref = `mailto:?subject=${encodeURIComponent("My Sargam Daily result")}&body=${encodeURIComponent(props.caption)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Share to"
      onClick={props.onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-t-[20px] border border-(--hairline) bg-(--surface) p-5 shadow-[0_-20px_60px_-30px_rgba(0,0,0,0.9)] sm:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-(--text)">Share to</p>
          <button
            type="button"
            onClick={props.onClose}
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-(--text-dim) transition-colors hover:bg-(--surface-hover) hover:text-(--text)"
            aria-label="Close share options"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5">
          {SHARE_TARGETS.map((target) => (
            <button
              key={target.name}
              type="button"
              onClick={() => open(target.href(props.caption, props.url))}
              className="flex flex-col items-center gap-1.5 rounded-xl py-2 transition-colors hover:bg-(--surface-hover)"
            >
              {/* Hairline so the white disc still reads as a tile on the light
                  theme, where the sheet itself is nearly as pale. */}
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-(--hairline) bg-white">
                <svg width="25" height="25" viewBox={target.viewBox ?? "0 0 24 24"} fill={target.brand} aria-hidden="true">
                  <path d={target.path} />
                </svg>
              </span>
              <span className="text-[10px] font-semibold text-(--text-dim)">{target.name}</span>
            </button>
          ))}
          <a
            href={mailHref}
            onClick={props.onClose}
            className="flex flex-col items-center gap-1.5 rounded-xl py-2 transition-colors hover:bg-(--surface-hover)"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-(--hairline) bg-(--surface-hover) text-(--text)" aria-hidden="true">
              <MailIcon />
            </span>
            <span className="text-[10px] font-semibold text-(--text-dim)">Email</span>
          </a>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-(--hairline) pt-4">
          <button
            type="button"
            onClick={props.onCopy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-(--hairline) bg-(--surface-hover) px-3 text-xs font-semibold text-(--text) transition-colors hover:bg-(--surface)"
          >
            <CopyIcon />
            Copy caption
          </button>
          <button
            type="button"
            onClick={props.onSave}
            className="flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-(--hairline) bg-(--surface-hover) px-3 text-xs font-semibold text-(--text) transition-colors hover:bg-(--surface)"
          >
            <SaveIcon />
            Save poster
          </button>
        </div>
      </div>
    </div>
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
  /// Set when the browser has no native share sheet, so the in-app app picker
  /// takes over. Never auto-saves the PNG: a download is not a share.
  const [sheet, setSheet] = useState<{ caption: string; url: string } | null>(null);

  async function posterFile() {
    const blob = await renderPoster(props);
    return new File([blob], `sargam-daily-${props.dayKey}.png`, { type: "image/png" });
  }

  /// Only ever reached from "Save poster" in the picker — an explicit ask, not
  /// a consolation prize for a share that didn't happen.
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
        // Native sheet is there but won't carry the image — still a share sheet,
        // so the caption and link go through it rather than into a download.
        await navigator.share({ title: "My Sargam Daily result", text: caption, url: shareUrl });
        setStatus("Link shared.");
      } else {
        setSheet({ caption, url: shareUrl });
        setStatus(null);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus(null);
        return;
      }
      // A native sheet that refuses (NotAllowedError on a stale gesture, an
      // unsupported payload) falls back to the picker, not to a download.
      setSheet({ caption, url: shareUrl });
      setStatus(null);
    }
  }

  async function handleCopyCaption(caption: string) {
    try {
      await navigator.clipboard.writeText(caption);
      setStatus("Caption copied.");
    } catch {
      setStatus("Couldn’t copy. Select the link on the card.");
    }
    setSheet(null);
  }

  async function handleSavePoster() {
    try {
      download(await posterFile());
      setStatus("Poster saved.");
    } catch {
      setStatus("Couldn’t save the poster. Try again.");
    }
    setSheet(null);
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

      {sheet ? (
        <ShareSheet
          caption={sheet.caption}
          url={sheet.url}
          onCopy={() => void handleCopyCaption(sheet.caption)}
          onSave={() => void handleSavePoster()}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </section>
  );
}

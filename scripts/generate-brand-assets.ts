/// Derives every icon and social-card image the site serves from the two
/// full-resolution brand files in public/brand/.
///
/// Run it after changing either source file:
///
///   npm run brand
///
/// Why a script and not next/og's ImageResponse: these images never change
/// between requests, so rendering them per request (or per deploy) buys
/// nothing and costs a Function invocation plus a satori font download on
/// every social-card scrape. Committed PNGs are served straight off the CDN.
///
/// The two sources stay at full resolution and are never written to — they are
/// the masters. Everything this script emits is a derivative and safe to
/// delete and regenerate.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const MARK = path.join(ROOT, "public/brand/cluecade-mark.png");
const SARGAM_LOGO = path.join(ROOT, "public/brand/sargam-logo.png");

/// --bg from the dark theme in globals.css. Social cards are scraped once and
/// cached, so they can't follow the viewer's light/dark preference — the dark
/// backdrop is the one that matches the product's own default artwork.
const BRAND_BG = { r: 13, g: 17, b: 32, alpha: 1 };

/// Open Graph's documented ideal is 1200x630 (1.91:1). Facebook, LinkedIn,
/// WhatsApp and X all crop to roughly that; the 2048x768 master is 2.67:1 and
/// gets its edges shaved off by every one of them.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

type IconTarget = { out: string; size: number };

/// The favicon and the apple-touch icon are Next file conventions: a PNG at
/// src/app/icon.png and src/app/apple-icon.png makes Next emit the matching
/// <link rel> tags automatically, no manual <head> work.
///
/// The sizes are what each consumer actually renders. 256 covers the largest
/// favicon slot any browser asks for (a 1254px master was ~935 KB of payload
/// for a 16px tab icon), and 180 is the exact size iOS wants for the home
/// screen — it upscales nothing and downscales nothing.
const ICONS: IconTarget[] = [
  { out: "src/app/icon.png", size: 256 },
  { out: "src/app/apple-icon.png", size: 180 },
  // Referenced by name from src/app/manifest.ts, which needs stable public
  // paths — the file-convention icons above are served at hashed URLs.
  { out: "public/icons/icon-192.png", size: 192 },
  { out: "public/icons/icon-512.png", size: 512 },
];

/// Android's maskable icon spec crops to a circle or squircle, keeping only
/// the middle ~80%. The mark is square and edge-to-edge, so it needs padding
/// baked in or the corners get sliced off on the home screen.
const MASKABLE = { out: "public/icons/icon-maskable-512.png", size: 512 };
const MASKABLE_SAFE_ZONE = 0.8;

async function ensureDirs() {
  await mkdir(path.join(ROOT, "public/icons"), { recursive: true });
  await mkdir(path.join(ROOT, "public/og"), { recursive: true });
}

async function writeIcons() {
  for (const { out, size } of ICONS) {
    const bytes = await sharp(MARK)
      .resize(size, size, { fit: "cover" })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

    await sharp(bytes).toFile(path.join(ROOT, out));
    console.log(`  ${out} — ${size}x${size}, ${(bytes.length / 1024).toFixed(1)} KB`);
  }
}

async function writeMaskableIcon() {
  const inner = Math.round(MASKABLE.size * MASKABLE_SAFE_ZONE);
  const pad = Math.round((MASKABLE.size - inner) / 2);

  const bytes = await sharp({
    create: {
      width: MASKABLE.size,
      height: MASKABLE.size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([
      {
        input: await sharp(MARK).resize(inner, inner, { fit: "cover" }).toBuffer(),
        top: pad,
        left: pad,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp(bytes).toFile(path.join(ROOT, MASKABLE.out));
  console.log(
    `  ${MASKABLE.out} — ${MASKABLE.size}x${MASKABLE.size} (${Math.round(MASKABLE_SAFE_ZONE * 100)}% safe zone), ${(bytes.length / 1024).toFixed(1)} KB`,
  );
}

/// The colour to letterbox a source against.
///
/// Whether the source carries an opaque backdrop of its own.
///
/// It decides which of the two card treatments below applies, and the corner
/// pixel is a reliable test for these two files: cluecade-mark.png is a mark
/// on a filled square, sargam-logo.png is a wordmark on transparency.
async function hasOwnBackdrop(source: string): Promise<boolean> {
  const [, , , alpha] = await sharp(source)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();

  return alpha === 255;
}

/// Card treatment for a source that brings its own backdrop.
///
/// The square is scaled to the full 630px height and its edge pixels are then
/// repeated outward to fill the 1200px width. Matting it on a flat colour was
/// the obvious approach and it doesn't work: the mark's backdrop is a subtle
/// radial gradient, so any single colour — even the exact corner pixel —
/// leaves a visible rectangle where the gradient meets the flat fill.
/// Extending the edge columns continues that gradient instead of butting
/// against it, and there is no seam to see.
async function writeFullBleedCard(source: string, out: string) {
  const square = await sharp(source)
    .resize(OG_HEIGHT, OG_HEIGHT, { fit: "cover" })
    .toBuffer();

  const sides = (OG_WIDTH - OG_HEIGHT) / 2;

  const bytes = await sharp(square)
    .extend({
      left: Math.floor(sides),
      right: Math.ceil(sides),
      extendWith: "copy",
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp(bytes).toFile(path.join(ROOT, out));
  logCard(out, bytes.length);
}

/// Card treatment for a source on transparency: letterbox it on the brand
/// colour, centred, at `scale` of the card's box.
///
/// `fit: "contain"` rather than "cover" — a social card that crops the
/// wordmark is worse than one with margins.
async function writeLetterboxedCard(source: string, out: string, scale: number) {
  const inner = await sharp(source)
    .resize({
      width: Math.round(OG_WIDTH * scale),
      height: Math.round(OG_HEIGHT * scale),
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const bytes = await sharp({
    create: {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: inner, gravity: "centre" }])
    // flatten() drops the alpha channel: several scrapers (X's card renderer
    // among them) composite transparent PNGs onto white, which would put the
    // pale wordmark on a light card exactly where the design assumes it won't
    // be.
    .flatten({ background: BRAND_BG })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp(bytes).toFile(path.join(ROOT, out));
  logCard(out, bytes.length);
}

function logCard(out: string, byteLength: number) {
  console.log(
    `  ${out} — ${OG_WIDTH}x${OG_HEIGHT}, ${(byteLength / 1024).toFixed(1)} KB`,
  );
}

async function writeOgCard(source: string, out: string, scale: number) {
  if (await hasOwnBackdrop(source)) {
    await writeFullBleedCard(source, out);
    return;
  }

  await writeLetterboxedCard(source, out, scale);
}

async function main() {
  await ensureDirs();

  console.log("icons");
  await writeIcons();
  await writeMaskableIcon();

  console.log("open graph cards");
  // The scale only applies to the letterboxed treatment — the square mark
  // goes full-bleed and ignores it. 0.82 lets the wide Sargam wordmark run
  // close to the edges without looking cramped.
  await writeOgCard(MARK, "public/og/cluecade.png", 0.62);
  await writeOgCard(SARGAM_LOGO, "public/og/sargam.png", 0.82);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/// Deterministic decoration derived from a string.
///
/// The mock catalog shipped a hand-picked `cover: [from, to]` gradient per song.
/// The API doesn't return one — and shouldn't; art direction per track isn't
/// something the game engine has an opinion about. So covers and the waveform
/// shape are generated from a seed instead: same title always looks the same,
/// two different titles reliably look different.
///
/// Seeded from the reveal (title/artist) rather than a puzzleId, so a solved
/// round keeps the same colours in the result panel and the history list.

/// FNV-1a. Not cryptographic — it just needs to spread short strings well.
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// The jewel-tone family the rest of the UI uses — marigold, vermillion,
/// peacock, gulaal, royal — rather than arbitrary hues, so a generated cover
/// still looks like it belongs to this app.
const COVER_PAIRS: [string, string][] = [
  ["#c0392b", "#f6c453"],
  ["#b8860b", "#7a1f1f"],
  ["#8e2de2", "#c0392b"],
  ["#0f9b8e", "#f6c453"],
  ["#2c3e91", "#e67e22"],
  ["#e84393", "#fdcb6e"],
  ["#34495e", "#8e44ad"],
  ["#d35400", "#f6c453"],
  ["#00695c", "#e84393"],
  ["#7a1f1f", "#e6b422"],
];

export function coverGradient(seed: string): [string, string] {
  return COVER_PAIRS[hash(seed) % COVER_PAIRS.length];
}

/// CSS value, for the common case of dropping it straight into a style prop.
export function coverBackground(seed: string): string {
  const [from, to] = coverGradient(seed);
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/// Bar heights, as percentages, for the player's waveform strip.
///
/// Decorative, and honestly so: it is not an analysis of the audio. Drawing a
/// real waveform would mean decoding the clip, and at stage 1 that is 200ms of
/// PCM stretched across a bar strip sized for the full 7s — a shape that says
/// less than this does. What it DOES convey truthfully is progress, via the
/// colour sweep the component paints over it.
export function waveformBars(seed: string, count: number): number[] {
  const random = mulberry32(hash(seed));
  return Array.from({ length: count }, () => 28 + 68 * random());
}

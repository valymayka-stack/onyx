import "server-only";
import crypto from "crypto";
import sharp from "sharp";

// Invisible (steganographic) forensic watermark — additive spread-spectrum
// using band-limited pseudo-noise carriers built from several summed 2D
// cosines in NORMALIZED coordinates (fraction of width/height), not raw
// pixel positions. This is a full rewrite of an earlier version that used a
// small repeating 8-pixel-period tile pattern (see git history) — that
// scheme was tuned for crop survival but, as documented at length there,
// could not survive a resize: its pattern was tied to an absolute pixel
// period, so resampling to a different resolution desynchronized it
// completely. That turned out to be exactly what breaks in practice: a
// screenshot of the delivered image is captured at whatever pixel density
// the browser rendered it at (CSS layout size × device pixel ratio),
// essentially never the original file's exact pixel dimensions.
//
// The fix, in two parts:
//
//  1. Normalized-coordinate carriers. Each of the 24 payload bits gets its
//     own carrier evaluated at (x/width, y/height) rather than absolute
//     (x, y). A resize changes width/height but not what fraction of the
//     image a given feature sits at, so the same carrier — recomputed fresh
//     from whatever dimensions extraction receives, exactly like the
//     bit-region grid in the old scheme was — lines back up with the
//     original at any resolution, as long as its frequencies stay well
//     under the new resolution's Nyquist limit (see FREQ_MAX / CANONICAL_SIZE).
//     This alone reliably survived every resize ratio tested (0.2x–1.5x,
//     see scripts/test-invisible-watermark.mjs), with zero bit errors.
//
//  2. Band-limited multi-tone carriers, not single sinusoids. An earlier
//     draft of this rewrite used one clean cosine per bit. It worked, but
//     visually it was worse than the scheme it replaced: a single low- or
//     mid-frequency sinusoid spread across a whole image is a textbook
//     sine-wave grating — literally the stimulus human vision (V1's
//     orientation/frequency-tuned neurons) is most sensitive to detecting,
//     so even a small amplitude showed up as a visible woven/banded
//     texture on smooth image regions. Summing TONES_PER_BIT
//     independent, randomly-phased cosines at nearby frequencies per bit
//     (a standard way to synthesize band-limited noise from sinusoids)
//     breaks that clean periodicity: the combined pattern reads as fine
//     grain/paper-texture rather than a coherent grating, while remaining
//     exactly reproducible (same secret-derived tones at embed and extract
//     time) and just as resize-invariant, since it's still built entirely
//     from normalized-coordinate cosines.
//
// Frequencies, phases, and per-bit tone assignments are all derived from
// WATERMARK_SECRET via a seeded PRNG, so correlating a suspect image against
// the right carriers still requires the secret, not just knowledge of this
// algorithm.
//
// What this rewrite gives up, deliberately: the old scheme's translation
// search (brute-forcing an 8x8 pixel phase offset to re-sync after a crop).
// An early version of this rewrite kept an analogous fractional-offset
// search, but it turned out to be actively broken with integer-frequency
// carriers: shifting by exactly half a period flips every carrier's sign in
// a fully deterministic, frequency-independent way, which makes that
// offset's aggregate |correlation| an exact tie with the true zero offset —
// magnitude alone can't tell them apart, so the "best" pick was effectively
// a coin flip between correct bits and a scrambled decoy. Removing the
// search entirely (always evaluate at zero offset) fixed that outright and,
// as a side effect, cut extraction cost by ~64x. The real, honest cost: crop
// tolerance is gone — empirically, even a 10% crop no longer reliably
// recovers (see the test script), because a crop changes what extraction
// normalizes width/height by, which (unlike a resize) really does shift
// every carrier's effective phase by an amount this version no longer
// searches for, and the FREQ_MIN..FREQ_MAX band chosen for visual quality
// (see below) is high enough that even a small phase error desyncs it. This
// is a real, different tradeoff, not a strict improvement on every axis: it
// prioritizes resize survival (the actual failure mode observed in
// practice — a screenshot) over the crop hardening the old scheme had.
// Revisit with a proper synchronization search (avoiding the tie above,
// e.g. via non-commensurate/irrational frequency ratios) if crop tolerance
// becomes a priority again.
//
// Extraction always resamples the input to a small fixed canonical size
// (CANONICAL_SIZE) before correlating — not just a speed optimization, it's
// the natural consequence of the scheme already being resize-invariant by
// design: normalizing to a fixed size up front costs nothing extra in
// accuracy as long as it stays well above the Nyquist limit for the highest
// embedded frequency, which CANONICAL_SIZE does with a wide margin, and it
// keeps extraction cost constant regardless of input resolution.

const TONES_PER_BIT = 6; // summed per bit to approximate band-limited noise instead of a single clean grating
const FREQ_MIN = 8;
const FREQ_MAX = 60; // cycles across the whole image — low enough to stay under JPEG's per-8px-block quantization at typical delivered resolutions, high enough to read as fine grain rather than a broad visible band
const GRID_COLS = 6;
const GRID_ROWS = 4;
const TOTAL_BITS = GRID_COLS * GRID_ROWS; // 24 — same code length as the old scheme
const CODE_HEX_CHARS = TOTAL_BITS / 4; // 6
const AMPLITUDE = 1.2; // per-bit amplitude budget; see module comment — tuned to the minimum that still gave zero bit errors across every tested resize ratio
const RGB_CHANNELS = 3;
const CANONICAL_SIZE = 256; // extraction resamples to this fixed size; embedded frequencies max out at 60 cycles/image, far under its Nyquist limit

export interface ExtractedMark {
  code: string;
  confidence: number;
}

function getSecretSeed(): number {
  const secret = process.env.WATERMARK_SECRET ?? "insecure-dev-fallback";
  const hash = crypto.createHash("sha256").update(secret).digest();
  return hash.readInt32BE(0);
}

interface Tone {
  fx: number;
  fy: number;
  phase: number;
}

let carrierCache: Tone[][] | null = null;

// Deterministic PRNG (mulberry32) seeded from WATERMARK_SECRET — same style
// used throughout this file's predecessor, kept for consistency.
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return function rand(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds each bit's TONES_PER_BIT-tone carrier: random (not necessarily
// distinct-from-other-bits) frequencies in [FREQ_MIN, FREQ_MAX] with random
// phases, all secret-derived.
function buildCarriers(seed: number): Tone[][] {
  if (carrierCache) return carrierCache;

  const rand = makeRand(seed);
  const carriers: Tone[][] = [];
  for (let bit = 0; bit < TOTAL_BITS; bit++) {
    const tones: Tone[] = [];
    for (let t = 0; t < TONES_PER_BIT; t++) {
      tones.push({
        fx: FREQ_MIN + rand() * (FREQ_MAX - FREQ_MIN),
        fy: FREQ_MIN + rand() * (FREQ_MAX - FREQ_MIN),
        phase: rand() * 2 * Math.PI,
      });
    }
    carriers.push(tones);
  }

  carrierCache = carriers;
  return carrierCache;
}

// Sum of TONES_PER_BIT unit-amplitude cosines, divided by sqrt(TONES_PER_BIT)
// so the carrier's typical magnitude stays comparable to a single cosine's
// (central-limit averaging) while its shape reads as fine grain rather than
// one clean periodic grating.
function carrierValue(tones: Tone[], nx: number, ny: number): number {
  let sum = 0;
  for (const t of tones) {
    sum += Math.cos(2 * Math.PI * (t.fx * nx + t.fy * ny) + t.phase);
  }
  return sum / Math.sqrt(tones.length);
}

function hexToBits(hex: string): number[] {
  const bits: number[] = [];
  for (const char of hex) {
    const nibble = parseInt(char, 16);
    for (let i = 3; i >= 0; i--) bits.push((nibble >>> i) & 1);
  }
  return bits;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (bits[i + b] ?? 0);
    hex += nibble.toString(16);
  }
  return hex;
}

export function generateCode(): string {
  return crypto.randomBytes(CODE_HEX_CHARS / 2).toString("hex");
}

// Hamming distance between two same-length hex codes, in bits — exported so
// the admin extraction route can rank stored delivery codes by closeness to
// a recovered (possibly imperfect) code instead of requiring an exact match.
export function hammingDistance(hexA: string, hexB: string): number {
  const bitsA = hexToBits(hexA);
  const bitsB = hexToBits(hexB);
  let distance = 0;
  for (let i = 0; i < Math.max(bitsA.length, bitsB.length); i++) {
    if ((bitsA[i] ?? 0) !== (bitsB[i] ?? 0)) distance++;
  }
  return distance;
}

export const TOTAL_CODE_BITS = TOTAL_BITS;

// Mutates rawPixels in place — call on the raw RGB buffer after the visible
// watermark is composited but before the final JPEG encode, so there's only
// one lossy re-encode in the whole pipeline instead of two.
export function embedInvisibleCode(
  rawPixels: Buffer,
  width: number,
  height: number,
  channels: number,
  code: string,
): void {
  const signedBits = hexToBits(code).map((b) => (b === 1 ? 1 : -1));
  const carriers = buildCarriers(getSecretSeed());

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      let delta = 0;
      for (let i = 0; i < TOTAL_BITS; i++) {
        delta += signedBits[i] * carrierValue(carriers[i], nx, ny);
      }
      delta *= AMPLITUDE;

      const base = (y * width + x) * channels;
      for (let c = 0; c < RGB_CHANNELS; c++) {
        rawPixels[base + c] = Math.max(0, Math.min(255, rawPixels[base + c] + delta));
      }
    }
  }
}

// Always returns its best guess (never gates on a self-check, since a
// checksum can only detect a wrong bit, never tolerate one) — the caller is
// expected to compare the returned code against known issued codes via
// hammingDistance() and decide its own confidence threshold. `confidence`
// here is the raw average correlation magnitude, useful for ranking but not
// a probability.
export async function extractInvisibleCode(imageBuffer: Buffer): Promise<ExtractedMark> {
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .toColourspace("srgb")
    .resize(CANONICAL_SIZE, CANONICAL_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const carriers = buildCarriers(getSecretSeed());

  const correlation = new Array<number>(TOTAL_BITS).fill(0);
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const base = (y * width + x) * channels;
      let luma = 0;
      for (let c = 0; c < RGB_CHANNELS; c++) luma += data[base + c];
      luma /= RGB_CHANNELS;

      for (let i = 0; i < TOTAL_BITS; i++) {
        correlation[i] += luma * carrierValue(carriers[i], nx, ny);
      }
    }
  }

  const pixelCount = width * height;
  const recoveredBits = correlation.map((c) => (c > 0 ? 1 : 0));
  const confidence = correlation.reduce((sum, c) => sum + Math.abs(c) / pixelCount, 0) / TOTAL_BITS;

  return { code: bitsToHex(recoveredBits), confidence };
}

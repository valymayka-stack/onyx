import "server-only";
import crypto from "crypto";
import sharp from "sharp";

// Invisible (steganographic) forensic watermark — additive spread-spectrum,
// not LSB. Plain least-significant-bit steganography is wiped out by any
// JPEG re-encode, and the delivery pipeline already re-encodes on every
// request (plus whatever a piracy site does on top) — not viable given the
// real path this needs to survive.
//
// Two things had to be empirically fixed while building this (both
// reproducible via scripts/test-invisible-watermark.mjs, not just asserted):
//
//  1. The signal must be added equally to R, G, and B (a pure luminance
//     shift), not to a single channel. An early version embedded in blue
//     alone and JPEG's chroma subsampling (which blue feeds heavily via the
//     RGB->YCbCr transform) reduced an amplitude-14 signal to under ~2 after
//     a single quality-88 pass — nearly wiped out. An equal R=G=B delta
//     contributes nothing to Cb/Cr (the terms cancel) and lands entirely in
//     Y, which JPEG preserves at much higher fidelity.
//  2. The pseudorandom ±1 pattern for a given payload bit must be an
//     EXACTLY balanced shuffle over its BASE_TILE x BASE_TILE period, not
//     raw hash parity. That small tile repeats hundreds of times across a
//     bit's region, so even a slight imbalance (29+/35-) compounds every
//     repetition into a bias large enough to swamp the signal entirely.
//
// Two independent concerns, kept separate on purpose:
//  1. WHICH region of the image carries which payload bit — a macro grid
//     (GRID_COLS x GRID_ROWS cells, one per bit) recomputed fresh from
//     whatever image dimensions extraction is given.
//  2. The PN pattern's *phase* — generated from a small repeating
//     BASE_TILE x BASE_TILE period, so a crop only ever shifts it by
//     0..BASE_TILE-1 in each dimension. That small space is brute-forced at
//     extraction time (cheap), picking whichever phase maximizes average
//     correlation magnitude across all bits — a standard synchronization
//     approach for spread-spectrum detection, verified to reliably find the
//     true phase in testing.
//
// Honest, empirically-measured limitation (see scripts/test-invisible-watermark.mjs):
// 24 bits at amplitude 14 survives crops up to ~20% of each dimension with
// zero bit errors, and degrades gracefully rather than catastrophically at
// 30% (about 1-2 bits wrong out of 24 in testing) — which is exactly why
// matching is done by nearest Hamming distance against known issued codes
// (see extractInvisibleCode's caller) rather than requiring an exact,
// self-verifying checksum: a checksum can only detect an error, never
// tolerate one, and a few wrong bits under a real-world crop is expected,
// not exceptional. This does not attempt to survive rotation, resizing, or
// heavy degradation — those require correcting geometric distortion first,
// out of scope here.
//
// Resize-survival was investigated and abandoned (see git history / session
// notes): the natural idea — recompute the PN tile period proportionally to
// whatever dimensions extraction receives, then brute-force a small set of
// candidate tile sizes alongside the phase search — does NOT work. The
// reason is structural, not a tuning problem: this scheme's per-bit pattern
// is an independently-generated random ±1 shuffle, and there's no
// mathematical reason an independently-generated *smaller* random pattern
// should correlate with what a *resized* copy of the original pattern
// actually looks like (downsampling a random binary tile doesn't produce
// "the same pattern at a smaller size," it produces a specific, deterministic
// blend that a fresh random shuffle only matches by chance). Confirmed
// empirically: even in the idealized case (exact 2x nearest-neighbor
// decimation, no lowpass filtering, mathematically "correct" candidate tile
// size), confidence dropped from ~13.6 (baseline) to ~3.4 — real signal, but
// far below reliable detection (needs sustained correlation, not a fraction
// of it). A real fix requires switching the embedding basis itself to smooth
// low-frequency functions (e.g. 2D sinusoids in normalized coordinates, the
// classic transform-domain spread-spectrum approach) instead of random
// tiles — a materially different algorithm, with its own crop-robustness
// tradeoffs to re-validate, not a parameter tweak. Not attempted here;
// flagged as a real option to revisit if resize-survival becomes a priority.

const BASE_TILE = 8;
const GRID_COLS = 6;
const GRID_ROWS = 4;
const TOTAL_BITS = GRID_COLS * GRID_ROWS; // 24 — also the full code length, in bits
const CODE_HEX_CHARS = TOTAL_BITS / 4; // 6
const AMPLITUDE = 14;
// After removeAlpha()+toColourspace("srgb"), channel order is R,G,B. See the
// module comment above for why the signal is added to all three equally.
const RGB_CHANNELS = 3;

export interface ExtractedMark {
  code: string;
  confidence: number;
}

function getSecretSeed(): number {
  const secret = process.env.WATERMARK_SECRET ?? "insecure-dev-fallback";
  const hash = crypto.createHash("sha256").update(secret).digest();
  return hash.readInt32BE(0);
}

// Each bitIndex's BASE_TILE x BASE_TILE pattern is an exactly-balanced
// shuffle (half the cells +1, half -1) — see the module comment for why an
// unbalanced pattern breaks this in practice, not just in theory.
const patternCache = new Map<number, ReadonlyArray<1 | -1>>();

function getPnPattern(seed: number, bitIndex: number): ReadonlyArray<1 | -1> {
  const cached = patternCache.get(bitIndex);
  if (cached) return cached;

  let s = (seed ^ Math.imul(bitIndex + 1, 0x9e3779b1)) >>> 0;
  function rand(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const cellCount = BASE_TILE * BASE_TILE;
  const pattern: (1 | -1)[] = new Array(cellCount);
  for (let i = 0; i < cellCount / 2; i++) pattern[i] = 1;
  for (let i = cellCount / 2; i < cellCount; i++) pattern[i] = -1;
  for (let i = cellCount - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pattern[i], pattern[j]] = [pattern[j], pattern[i]];
  }

  patternCache.set(bitIndex, pattern);
  return pattern;
}

function pnValue(seed: number, bitIndex: number, lx: number, ly: number): 1 | -1 {
  return getPnPattern(seed, bitIndex)[ly * BASE_TILE + lx];
}

function bitIndexForPixel(x: number, y: number, width: number, height: number): number {
  const col = Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS));
  const row = Math.min(GRID_ROWS - 1, Math.floor((y / height) * GRID_ROWS));
  return row * GRID_COLS + col;
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
  const payloadBits = hexToBits(code);
  const seed = getSecretSeed();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bitIndex = bitIndexForPixel(x, y, width, height);
      const bitVal = payloadBits[bitIndex] === 1 ? 1 : -1;
      const pn = pnValue(seed, bitIndex, x % BASE_TILE, y % BASE_TILE);
      const delta = bitVal * pn * AMPLITUDE;
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
// here is the raw average correlation magnitude at the best-scoring phase,
// useful for ranking but not a probability.
export async function extractInvisibleCode(imageBuffer: Buffer): Promise<ExtractedMark> {
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const seed = getSecretSeed();
  let best: ExtractedMark | null = null;

  for (let oy = 0; oy < BASE_TILE; oy++) {
    for (let ox = 0; ox < BASE_TILE; ox++) {
      const correlation = new Array<number>(TOTAL_BITS).fill(0);
      const pixelCount = new Array<number>(TOTAL_BITS).fill(0);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const bitIndex = bitIndexForPixel(x, y, width, height);
          const pn = pnValue(seed, bitIndex, (x + ox) % BASE_TILE, (y + oy) % BASE_TILE);
          const base = (y * width + x) * channels;
          let luma = 0;
          for (let c = 0; c < RGB_CHANNELS; c++) luma += data[base + c];
          luma /= RGB_CHANNELS;
          correlation[bitIndex] += luma * pn;
          pixelCount[bitIndex] += 1;
        }
      }

      const avgAbsCorrelation =
        correlation.reduce((sum, c, i) => sum + Math.abs(c) / (pixelCount[i] || 1), 0) / TOTAL_BITS;

      if (!best || avgAbsCorrelation > best.confidence) {
        const recoveredBits = correlation.map((sum, i) => (sum / (pixelCount[i] || 1) > 0 ? 1 : 0));
        best = { code: bitsToHex(recoveredBits), confidence: avgAbsCorrelation };
      }
    }
  }

  // best is always set — the loop runs BASE_TILE² >= 1 iterations.
  return best as ExtractedMark;
}

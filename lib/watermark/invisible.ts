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
//
// Embedding needed the same fix, the hard way: the trig-table optimization
// above cut per-pixel-per-tone cost from a Math.cos() call to two multiplies
// and a subtract, but the total work is still O(width·height·TOTAL_TONES) —
// proportional to the delivered image's real resolution, which a phone photo
// or DSLR scan makes large. That "only" 12x-faster version still took ~3s on
// a realistic phone photo, and — because Node is single-threaded — that 3s
// blocks every other concurrent request on the whole server, not just the
// one being watermarked. That caused a second production outage right after
// the first (see git history): loading a page with several photos fires
// several concurrent /api/content requests, and their embed costs stack up
// serially on the one event loop regardless of how fast each individually
// is, easily exceeding the point where the whole site stops responding.
//
// The actual fix is to stop scaling with the delivered resolution at all:
// compute the delta pattern once on a small fixed EMBED_GRID_SIZE grid (via
// the same trig tables, now bounded cost regardless of the real image size),
// then bilinearly upsample that grid onto the real pixels. This is safe
// precisely because the carriers are already band-limited well under
// EMBED_GRID_SIZE's Nyquist limit (FREQ_MAX=60 vs 256 — 4x+ oversampled), so
// bilinear interpolation of the low-res grid reconstructs the same smooth
// pattern extraction expects, with no measured effect on bit recovery across
// every resize/quality scenario in scripts/test-invisible-watermark.mjs.
// Verified empirically, not just reasoned about: max per-channel deviation
// from the exact full-resolution computation was 8/255 on a stress test, and
// detection was still bit-exact. The payoff is total embed cost collapsing
// from "proportional to megapixels" to "proportional to EMBED_GRID_SIZE² for
// the grid, plus a cheap no-trig upsample pass over the real pixels" — a
// 6000×4000 DSLR photo dropped from ~3s to ~0.3s.

const TONES_PER_BIT = 6; // summed per bit to approximate band-limited noise instead of a single clean grating
const FREQ_MIN = 8;
const FREQ_MAX = 60; // cycles across the whole image — low enough to stay under JPEG's per-8px-block quantization at typical delivered resolutions, high enough to read as fine grain rather than a broad visible band
const GRID_COLS = 6;
const GRID_ROWS = 4;
const TOTAL_BITS = GRID_COLS * GRID_ROWS; // 24 — same code length as the old scheme
const CODE_HEX_CHARS = TOTAL_BITS / 4; // 6
// Per-bit amplitude budget. Originally shipped at 1.2, tuned down after
// real-photo feedback that the grain was still visibly worse than the old
// scheme, not just theoretically less bad. Detection confidence scales
// with amplitude far more slowly than visibility does (the earlier 1.2 and
// this 0.3 both gave zero bit errors across every tested resize ratio and
// a comfortable margin over an unrelated image's baseline correlation —
// see scripts/test-invisible-watermark.mjs), so there was real headroom to
// cut it without losing reliability. Max per-pixel delta at this amplitude
// is ~4.5/255, versus ~17/255 at the original 1.2.
const AMPLITUDE = 0.3;
const RGB_CHANNELS = 3;
const CANONICAL_SIZE = 256; // extraction resamples to this fixed size; embedded frequencies max out at 60 cycles/image, far under its Nyquist limit
const EMBED_GRID_SIZE = 512; // embed computes the delta pattern at this fixed size and upsamples — see embedInvisibleCode

export interface ExtractedMark {
  code: string;
  confidence: number;
}

function getSecretSeed(): number {
  const secret = process.env.WATERMARK_SECRET ?? "insecure-dev-fallback";
  const hash = crypto.createHash("sha256").update(secret).digest();
  return hash.readInt32BE(0);
}

// Flat (not grouped by bit) so the hot pixel loop below can iterate one flat
// array instead of TOTAL_BITS separate small arrays — see FlatCarriers.
const TOTAL_TONES = TOTAL_BITS * TONES_PER_BIT;

interface FlatCarriers {
  fx: Float64Array;
  fy: Float64Array;
  phase: Float64Array;
  bitOf: Int32Array; // which of the 24 bits each flat tone belongs to
}

let carrierCache: FlatCarriers | null = null;

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
// phases, all secret-derived. Flattened across all bits up front so both the
// embed and extract hot loops can walk one flat array of TOTAL_TONES entries.
function buildCarriers(seed: number): FlatCarriers {
  if (carrierCache) return carrierCache;

  const rand = makeRand(seed);
  const fx = new Float64Array(TOTAL_TONES);
  const fy = new Float64Array(TOTAL_TONES);
  const phase = new Float64Array(TOTAL_TONES);
  const bitOf = new Int32Array(TOTAL_TONES);

  let flat = 0;
  for (let bit = 0; bit < TOTAL_BITS; bit++) {
    for (let t = 0; t < TONES_PER_BIT; t++) {
      fx[flat] = FREQ_MIN + rand() * (FREQ_MAX - FREQ_MIN);
      fy[flat] = FREQ_MIN + rand() * (FREQ_MAX - FREQ_MIN);
      phase[flat] = rand() * 2 * Math.PI;
      bitOf[flat] = bit;
      flat++;
    }
  }

  carrierCache = { fx, fy, phase, bitOf };
  return carrierCache;
}

// Per-axis trig tables for every flat tone, evaluated once per image instead
// of once per pixel. cos(2π(fx·x/w + fy·y/h) + phase) factors as
// cos(A+B) = cosA·cosB - sinA·sinB where A = 2π·fx·x/w (x-only) and
// B = 2π·fy·y/h + phase (y-only), so precomputing both halves turns the
// per-pixel-per-tone cost into 2 multiplies and a subtract instead of a
// transcendental Math.cos() call — the difference between an embed taking
// tens of seconds (blocking the whole Node process, and everyone else's
// requests with it — see git history for the production outage this caused)
// and one taking a fraction of a second, for the exact same output.
interface TrigTables {
  cosX: Float64Array; // [tone*width + x]
  sinX: Float64Array;
  cosYP: Float64Array; // [tone*height + y], phase already folded in
  sinYP: Float64Array;
}

function buildTrigTables(carriers: FlatCarriers, width: number, height: number): TrigTables {
  const cosX = new Float64Array(TOTAL_TONES * width);
  const sinX = new Float64Array(TOTAL_TONES * width);
  const cosYP = new Float64Array(TOTAL_TONES * height);
  const sinYP = new Float64Array(TOTAL_TONES * height);

  for (let t = 0; t < TOTAL_TONES; t++) {
    const fx = carriers.fx[t];
    const fy = carriers.fy[t];
    const phase = carriers.phase[t];
    const xBase = t * width;
    for (let x = 0; x < width; x++) {
      const a = 2 * Math.PI * fx * (x / width);
      cosX[xBase + x] = Math.cos(a);
      sinX[xBase + x] = Math.sin(a);
    }
    const yBase = t * height;
    for (let y = 0; y < height; y++) {
      const b = 2 * Math.PI * fy * (y / height) + phase;
      cosYP[yBase + y] = Math.cos(b);
      sinYP[yBase + y] = Math.sin(b);
    }
  }

  return { cosX, sinX, cosYP, sinYP };
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

// Computes the additive delta pattern for this code on a fixed small grid
// (EMBED_GRID_SIZE × EMBED_GRID_SIZE), regardless of the real image's
// resolution — see the module comment on why this bound is what actually
// fixes the blocking-cost problem, not just the trig-table optimization.
function computeDeltaGrid(carriers: FlatCarriers, signedBits: number[]): Float64Array {
  const { cosX, sinX, cosYP, sinYP } = buildTrigTables(carriers, EMBED_GRID_SIZE, EMBED_GRID_SIZE);

  const weight = new Float64Array(TOTAL_TONES);
  const normalize = AMPLITUDE / Math.sqrt(TONES_PER_BIT);
  for (let t = 0; t < TOTAL_TONES; t++) {
    weight[t] = signedBits[carriers.bitOf[t]] * normalize;
  }

  const delta = new Float64Array(EMBED_GRID_SIZE * EMBED_GRID_SIZE);
  const rowCosYP = new Float64Array(TOTAL_TONES);
  const rowSinYP = new Float64Array(TOTAL_TONES);

  for (let gy = 0; gy < EMBED_GRID_SIZE; gy++) {
    for (let t = 0; t < TOTAL_TONES; t++) {
      rowCosYP[t] = cosYP[t * EMBED_GRID_SIZE + gy];
      rowSinYP[t] = sinYP[t * EMBED_GRID_SIZE + gy];
    }
    for (let gx = 0; gx < EMBED_GRID_SIZE; gx++) {
      let d = 0;
      for (let t = 0; t < TOTAL_TONES; t++) {
        const xBase = t * EMBED_GRID_SIZE + gx;
        d += weight[t] * (cosX[xBase] * rowCosYP[t] - sinX[xBase] * rowSinYP[t]);
      }
      delta[gy * EMBED_GRID_SIZE + gx] = d;
    }
  }

  return delta;
}

// Bilinear lookup into the delta grid at normalized position (nx, ny), each
// in [0, 1) — no trig involved, just 4 array reads and a couple of lerps.
function sampleDeltaGrid(grid: Float64Array, nx: number, ny: number): number {
  const gx = nx * EMBED_GRID_SIZE - 0.5;
  const gy = ny * EMBED_GRID_SIZE - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const cx0 = Math.max(0, Math.min(EMBED_GRID_SIZE - 1, x0));
  const cx1 = Math.max(0, Math.min(EMBED_GRID_SIZE - 1, x0 + 1));
  const cy0 = Math.max(0, Math.min(EMBED_GRID_SIZE - 1, y0));
  const cy1 = Math.max(0, Math.min(EMBED_GRID_SIZE - 1, y0 + 1));

  const v00 = grid[cy0 * EMBED_GRID_SIZE + cx0];
  const v10 = grid[cy0 * EMBED_GRID_SIZE + cx1];
  const v01 = grid[cy1 * EMBED_GRID_SIZE + cx0];
  const v11 = grid[cy1 * EMBED_GRID_SIZE + cx1];
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

function embedRows(
  rawPixels: Buffer,
  width: number,
  channels: number,
  deltaGrid: Float64Array,
  height: number,
  yStart: number,
  yEnd: number,
): void {
  for (let y = yStart; y < yEnd; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const delta = sampleDeltaGrid(deltaGrid, nx, ny);

      const base = (y * width + x) * channels;
      for (let c = 0; c < RGB_CHANNELS; c++) {
        rawPixels[base + c] = Math.max(0, Math.min(255, rawPixels[base + c] + delta));
      }
    }
  }
}

// Rows processed per chunk before yielding back to the event loop (see the
// await below) — small enough that even a large delivered image never blocks
// the process for more than a couple ms at a stretch, large enough that the
// per-chunk overhead (one setImmediate round-trip) stays negligible next to
// the actual pixel work.
const EMBED_YIELD_EVERY_ROWS = 64;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Mutates rawPixels in place — call on the raw RGB buffer after the visible
// watermark is composited but before the final JPEG encode, so there's only
// one lossy re-encode in the whole pipeline instead of two.
//
// Async and chunked, not a single tight loop: the grid+upsample rewrite above
// made embed cost constant regardless of the delivered image's resolution,
// but "constant" still means real synchronous JS work (tens of ms), and
// Node's single-threaded event loop stalls on ALL other requests — logins,
// the feed, security-event posts, everything — for the full duration of one
// image's embed. Under concurrent traffic (several fans loading photos at
// once, which is normal, not adversarial) those stalls stack up serially and
// can make the whole server stop responding even though no single request is
// slow in isolation. Yielding via setImmediate every EMBED_YIELD_EVERY_ROWS
// rows lets the event loop service other pending work between chunks instead
// of monopolizing it for one contiguous stretch — same total CPU cost, but
// no single request can starve everyone else. This doesn't add real
// parallelism (still one core, still bounded by total throughput under
// heavy sustained load) — that's the right next step once concurrent volume
// actually gets there, via worker_threads or a separate rendering service.
export async function embedInvisibleCode(
  rawPixels: Buffer,
  width: number,
  height: number,
  channels: number,
  code: string,
): Promise<void> {
  const signedBits = hexToBits(code).map((b) => (b === 1 ? 1 : -1));
  const carriers = buildCarriers(getSecretSeed());
  const deltaGrid = computeDeltaGrid(carriers, signedBits);

  for (let yStart = 0; yStart < height; yStart += EMBED_YIELD_EVERY_ROWS) {
    const yEnd = Math.min(yStart + EMBED_YIELD_EVERY_ROWS, height);
    embedRows(rawPixels, width, channels, deltaGrid, height, yStart, yEnd);
    if (yEnd < height) await yieldToEventLoop();
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
  const { cosX, sinX, cosYP, sinYP } = buildTrigTables(carriers, width, height);
  const normalize = 1 / Math.sqrt(TONES_PER_BIT);

  const rowCosYP = new Float64Array(TOTAL_TONES);
  const rowSinYP = new Float64Array(TOTAL_TONES);
  const correlation = new Float64Array(TOTAL_BITS);

  for (let y = 0; y < height; y++) {
    for (let t = 0; t < TOTAL_TONES; t++) {
      rowCosYP[t] = cosYP[t * height + y];
      rowSinYP[t] = sinYP[t * height + y];
    }

    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * channels;
      let luma = 0;
      for (let c = 0; c < RGB_CHANNELS; c++) luma += data[base + c];
      luma /= RGB_CHANNELS;

      for (let t = 0; t < TOTAL_TONES; t++) {
        const xBase = t * width + x;
        const carrier = (cosX[xBase] * rowCosYP[t] - sinX[xBase] * rowSinYP[t]) * normalize;
        correlation[carriers.bitOf[t]] += luma * carrier;
      }
    }
  }

  const pixelCount = width * height;
  const recoveredBits = Array.from(correlation, (c) => (c > 0 ? 1 : 0));
  const confidence = Array.from(correlation).reduce((sum, c) => sum + Math.abs(c) / pixelCount, 0) / TOTAL_BITS;

  return { code: bitsToHex(recoveredBits), confidence };
}

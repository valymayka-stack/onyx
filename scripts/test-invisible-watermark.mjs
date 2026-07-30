// Standalone dev tool to validate the invisible watermark algorithm against
// realistic leak scenarios (resize, crop + recompress) without going through
// the full HTTP/browser flow. Mirrors the logic in lib/watermark/invisible.ts
// — kept as a plain .mjs script (not importing the .ts directly) so it can
// run with plain `node` while iterating on amplitude/frequency tuning.
//
// Usage: node scripts/test-invisible-watermark.mjs

import sharp from "sharp";
import crypto from "crypto";

const TONES_PER_BIT = 6;
const FREQ_MIN = 8;
const FREQ_MAX = 60;
const GRID_COLS = 6;
const GRID_ROWS = 4;
const TOTAL_BITS = GRID_COLS * GRID_ROWS; // 24
const TOTAL_TONES = TOTAL_BITS * TONES_PER_BIT;
const AMPLITUDE = 1.2;
const RGB_CHANNELS = 3;
const CANONICAL_SIZE = 256;
const EMBED_GRID_SIZE = 512;
const SECRET = "dev-only-9b1c7f3a5e8d2c6b4a0f9e7d3c1b5a8f6e2d0c4b7a9f1e3d5c8b0a6f4e2d9c1b";

function getSecretSeed() {
  const hash = crypto.createHash("sha256").update(SECRET).digest();
  return hash.readInt32BE(0);
}

function makeRand(seed) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let carrierCache = null;
function buildCarriers(seed) {
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

function buildTrigTables(carriers, width, height) {
  const cosX = new Float64Array(TOTAL_TONES * width);
  const sinX = new Float64Array(TOTAL_TONES * width);
  const cosYP = new Float64Array(TOTAL_TONES * height);
  const sinYP = new Float64Array(TOTAL_TONES * height);
  for (let t = 0; t < TOTAL_TONES; t++) {
    const fx = carriers.fx[t], fy = carriers.fy[t], phase = carriers.phase[t];
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

function computeDeltaGrid(carriers, signedBits) {
  const { cosX, sinX, cosYP, sinYP } = buildTrigTables(carriers, EMBED_GRID_SIZE, EMBED_GRID_SIZE);
  const weight = new Float64Array(TOTAL_TONES);
  const normalize = AMPLITUDE / Math.sqrt(TONES_PER_BIT);
  for (let t = 0; t < TOTAL_TONES; t++) weight[t] = signedBits[carriers.bitOf[t]] * normalize;

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

function sampleDeltaGrid(grid, nx, ny) {
  const gx = nx * EMBED_GRID_SIZE - 0.5;
  const gy = ny * EMBED_GRID_SIZE - 0.5;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
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

function hexToBits(hex) {
  const bits = [];
  for (const char of hex) {
    const nibble = parseInt(char, 16);
    for (let i = 3; i >= 0; i--) bits.push((nibble >>> i) & 1);
  }
  return bits;
}
function bitsToHex(bits) {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (bits[i + b] ?? 0);
    hex += nibble.toString(16);
  }
  return hex;
}
function hammingDistance(hexA, hexB) {
  const a = hexToBits(hexA);
  const b = hexToBits(hexB);
  let d = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) d++;
  return d;
}

function embedInvisibleCode(rawPixels, width, height, channels, code) {
  const signedBits = hexToBits(code).map((b) => (b === 1 ? 1 : -1));
  const carriers = buildCarriers(getSecretSeed());
  const deltaGrid = computeDeltaGrid(carriers, signedBits);
  let maxAbsDelta = 0;
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const delta = sampleDeltaGrid(deltaGrid, nx, ny);
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(delta));
      const base = (y * width + x) * channels;
      for (let c = 0; c < RGB_CHANNELS; c++) {
        rawPixels[base + c] = Math.max(0, Math.min(255, rawPixels[base + c] + delta));
      }
    }
  }
  return maxAbsDelta;
}

async function extractInvisibleCode(imageBuffer) {
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

const MATCH_THRESHOLD_BITS = 4; // out of 24 — same cutoff the admin extraction route uses

function report(label, testCode, recovered) {
  const distance = hammingDistance(testCode, recovered.code);
  const pass = distance <= MATCH_THRESHOLD_BITS;
  console.log(`${label}: recovered=${recovered.code} distance=${distance}/${TOTAL_BITS} confidence=${recovered.confidence.toFixed(3)}`);
  console.log(pass ? "PASS" : "FAIL");
  return pass;
}

async function main() {
  const testCode = crypto.randomBytes(3).toString("hex"); // 24 bits
  console.log("Embedding code:", testCode);

  const width = 1600;
  const height = 1200;
  const base = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      base[idx] = Math.floor((x / width) * 255);
      base[idx + 1] = Math.floor((y / height) * 255);
      base[idx + 2] = 128 + Math.floor(Math.random() * 40 - 20);
    }
  }

  const maxAbsDelta = embedInvisibleCode(base, width, height, 3, testCode);
  console.log(`Max |delta| applied to any single pixel/channel: ${maxAbsDelta.toFixed(1)} (out of 255)\n`);

  const marked = await sharp(base, { raw: { width, height, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();

  console.log("--- Test 1: exact roundtrip (no resize, no crop) ---");
  report("Test 1", testCode, await extractInvisibleCode(marked));

  console.log("\n--- Test 2: resize to 0.5x + recompress q80 (common screenshot downscale) ---");
  const resized50 = await sharp(marked).resize(Math.round(width * 0.5), Math.round(height * 0.5)).jpeg({ quality: 80 }).toBuffer();
  report("Test 2", testCode, await extractInvisibleCode(resized50));

  console.log("\n--- Test 3: resize to 0.77x (non-integer ratio, e.g. CSS-scaled screenshot) + recompress q85 ---");
  const resized77 = await sharp(marked).resize(Math.round(width * 0.77), Math.round(height * 0.77)).jpeg({ quality: 85 }).toBuffer();
  report("Test 3", testCode, await extractInvisibleCode(resized77));

  console.log("\n--- Test 4: resize UP to 1.5x (retina screenshot of a small on-screen render) + recompress q85 ---");
  const resizedUp = await sharp(marked).resize(Math.round(width * 1.5), Math.round(height * 1.5)).jpeg({ quality: 85 }).toBuffer();
  report("Test 4", testCode, await extractInvisibleCode(resizedUp));

  console.log("\n--- Test 5: resize to 0.2x (small screenshot) + recompress q70 (stress test) ---");
  const resized20 = await sharp(marked).resize(Math.round(width * 0.2), Math.round(height * 0.2)).jpeg({ quality: 70 }).toBuffer();
  report("Test 5", testCode, await extractInvisibleCode(resized20));

  console.log("\n--- Test 6: crop 10% + recompress q80 (no resize) ---");
  const meta = await sharp(marked).metadata();
  const cropFrac = 0.1;
  const cropWidth = Math.floor(meta.width * (1 - cropFrac));
  const cropHeight = Math.floor(meta.height * (1 - cropFrac));
  const left = Math.floor((meta.width * cropFrac) / 2);
  const top = Math.floor((meta.height * cropFrac) / 2);
  const cropped = await sharp(marked).extract({ left, top, width: cropWidth, height: cropHeight }).jpeg({ quality: 80 }).toBuffer();
  report("Test 6", testCode, await extractInvisibleCode(cropped));

  console.log("\n--- Test 7: crop 20% + recompress q80 (stress test — expected to degrade, see module comment) ---");
  const cropFrac2 = 0.2;
  const cw = Math.floor(meta.width * (1 - cropFrac2));
  const ch = Math.floor(meta.height * (1 - cropFrac2));
  const cl = Math.floor((meta.width * cropFrac2) / 2);
  const ct = Math.floor((meta.height * cropFrac2) / 2);
  const croppedSevere = await sharp(marked).extract({ left: cl, top: ct, width: cw, height: ch }).jpeg({ quality: 80 }).toBuffer();
  report("Test 7", testCode, await extractInvisibleCode(croppedSevere));

  console.log("\n--- Test 8: unrelated image should NOT produce a close match ---");
  const unrelated = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 100, b: 50 } } }).jpeg().toBuffer();
  const noMatch = await extractInvisibleCode(unrelated);
  const distance = hammingDistance(testCode, noMatch.code);
  console.log(`Test 8: recovered=${noMatch.code} distance=${distance}/${TOTAL_BITS} (want > ${MATCH_THRESHOLD_BITS})`);
  console.log(distance > MATCH_THRESHOLD_BITS ? "PASS (correctly not a close match)" : "FAIL (false positive!)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Standalone dev tool to validate the invisible watermark algorithm against
// a realistic leak scenario (crop + recompress) without going through the
// full HTTP/browser flow. Mirrors the logic in lib/watermark/invisible.ts —
// kept as a plain .mjs script (not importing the .ts directly) so it can run
// with plain `node` while iterating on amplitude/grid tuning.
//
// Usage: node scripts/test-invisible-watermark.mjs

import sharp from "sharp";
import crypto from "crypto";

const BASE_TILE = 8;
const GRID_COLS = 6;
const GRID_ROWS = 4;
const TOTAL_BITS = GRID_COLS * GRID_ROWS; // 24
const AMPLITUDE = 14;
const RGB_CHANNELS = 3; // signal added equally to R,G,B — pure luma shift, survives JPEG chroma subsampling
const SECRET = "dev-only-9b1c7f3a5e8d2c6b4a0f9e7d3c1b5a8f6e2d0c4b7a9f1e3d5c8b0a6f4e2d9c1b";

function getSecretSeed() {
  const hash = crypto.createHash("sha256").update(SECRET).digest();
  return hash.readInt32BE(0);
}

const patternCache = new Map();
function getPnPattern(seed, bitIndex) {
  const cached = patternCache.get(bitIndex);
  if (cached) return cached;
  let s = (seed ^ Math.imul(bitIndex + 1, 0x9e3779b1)) >>> 0;
  function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const cellCount = BASE_TILE * BASE_TILE;
  const pattern = new Array(cellCount);
  for (let i = 0; i < cellCount / 2; i++) pattern[i] = 1;
  for (let i = cellCount / 2; i < cellCount; i++) pattern[i] = -1;
  for (let i = cellCount - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pattern[i], pattern[j]] = [pattern[j], pattern[i]];
  }
  patternCache.set(bitIndex, pattern);
  return pattern;
}
function pnValue(seed, bitIndex, lx, ly) {
  return getPnPattern(seed, bitIndex)[ly * BASE_TILE + lx];
}

function bitIndexForPixel(x, y, width, height) {
  const col = Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS));
  const row = Math.min(GRID_ROWS - 1, Math.floor((y / height) * GRID_ROWS));
  return row * GRID_COLS + col;
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

async function extractInvisibleCode(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const seed = getSecretSeed();
  let best = null;

  for (let oy = 0; oy < BASE_TILE; oy++) {
    for (let ox = 0; ox < BASE_TILE; ox++) {
      const correlation = new Array(TOTAL_BITS).fill(0);
      const pixelCount = new Array(TOTAL_BITS).fill(0);

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
  return best;
}

// Matching is by nearest Hamming distance against known codes, not an exact
// checksum — a checksum can only detect a wrong bit, never tolerate one, and
// a few wrong bits under a real crop is expected, not exceptional (see the
// module comment in lib/watermark/invisible.ts). MATCH_THRESHOLD_BITS is the
// same cutoff the admin extraction route would use.
const MATCH_THRESHOLD_BITS = 4; // out of 24 — roughly 83%+ agreement required

function report(label, testCode, recovered) {
  const distance = hammingDistance(testCode, recovered.code);
  const pass = distance <= MATCH_THRESHOLD_BITS;
  console.log(`${label}: recovered=${recovered.code} distance=${distance}/${TOTAL_BITS} confidence=${recovered.confidence.toFixed(2)}`);
  console.log(pass ? "PASS" : "FAIL");
  return pass;
}

async function main() {
  const testCode = crypto.randomBytes(3).toString("hex"); // 24 bits
  console.log("Embedding code:", testCode);

  // Build a synthetic 800x800 test image with some structure (gradient +
  // noise), similar in spirit to a real photo rather than flat color.
  const width = 800;
  const height = 800;
  const base = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      base[idx] = Math.floor((x / width) * 255);
      base[idx + 1] = Math.floor((y / height) * 255);
      base[idx + 2] = 128 + Math.floor(Math.random() * 40 - 20);
    }
  }

  embedInvisibleCode(base, width, height, 3, testCode);

  const marked = await sharp(base, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 88 })
    .toBuffer();

  console.log("\n--- Test 1: exact roundtrip (no crop, no extra recompression) ---");
  const roundtrip = await extractInvisibleCode(marked);
  report("Test 1", testCode, roundtrip);

  console.log("\n--- Test 2: crop 20% + recompress at quality 80 (realistic leak) ---");
  const meta = await sharp(marked).metadata();
  const cropFrac = 0.2;
  const cropWidth = Math.floor(meta.width * (1 - cropFrac));
  const cropHeight = Math.floor(meta.height * (1 - cropFrac));
  const left = Math.floor((meta.width * cropFrac) / 2);
  const top = Math.floor((meta.height * cropFrac) / 2);
  const cropped = await sharp(marked)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 80 })
    .toBuffer();

  const afterCrop = await extractInvisibleCode(cropped);
  report("Test 2", testCode, afterCrop);

  console.log("\n--- Test 3: severe crop 30% + recompress at quality 75 (stress test, degraded-but-close match expected) ---");
  const cropFrac2 = 0.3;
  const cropWidth2 = Math.floor(meta.width * (1 - cropFrac2));
  const cropHeight2 = Math.floor(meta.height * (1 - cropFrac2));
  const left2 = Math.floor((meta.width * cropFrac2) / 2);
  const top2 = Math.floor((meta.height * cropFrac2) / 2);
  const croppedSevere = await sharp(marked)
    .extract({ left: left2, top: top2, width: cropWidth2, height: cropHeight2 })
    .jpeg({ quality: 75 })
    .toBuffer();
  const afterSevereCrop = await extractInvisibleCode(croppedSevere);
  report("Test 3", testCode, afterSevereCrop);

  console.log("\n--- Test 4: unrelated image should NOT produce a close match ---");
  const unrelated = await sharp({
    create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
  const noMatch = await extractInvisibleCode(unrelated);
  const distance = hammingDistance(testCode, noMatch.code);
  console.log(`Test 4: recovered=${noMatch.code} distance=${distance}/${TOTAL_BITS} (want > ${MATCH_THRESHOLD_BITS})`);
  console.log(distance > MATCH_THRESHOLD_BITS ? "PASS (correctly not a close match)" : "FAIL (false positive!)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

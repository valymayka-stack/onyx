import sharp from "sharp";
import crypto from "crypto";
import fs from "fs";

const BASE_TILE = 8, GRID_COLS = 6, GRID_ROWS = 4, TOTAL_BITS = 24, AMPLITUDE = 14, RGB_CHANNELS = 3;
const SECRET = "dev-only-9b1c7f3a5e8d2c6b4a0f9e7d3c1b5a8f6e2d0c4b7a9f1e3d5c8b0a6f4e2d9c1b";
function getSecretSeed() { return crypto.createHash("sha256").update(SECRET).digest().readInt32BE(0); }
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
function pnValue(seed, bitIndex, lx, ly) { return getPnPattern(seed, bitIndex)[ly * BASE_TILE + lx]; }
function bitIndexForPixel(x, y, width, height) {
  const col = Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS));
  const row = Math.min(GRID_ROWS - 1, Math.floor((y / height) * GRID_ROWS));
  return row * GRID_COLS + col;
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
function hexToBits(hex) {
  const bits = [];
  for (const char of hex) {
    const nibble = parseInt(char, 16);
    for (let i = 3; i >= 0; i--) bits.push((nibble >>> i) & 1);
  }
  return bits;
}
function hammingDistance(hexA, hexB) {
  const a = hexToBits(hexA), b = hexToBits(hexB);
  let d = 0;
  for (let i=0;i<Math.max(a.length,b.length);i++) if ((a[i]??0)!==(b[i]??0)) d++;
  return d;
}

async function extractInvisibleCode(imageBuffer) {
  const { data, info } = await sharp(imageBuffer).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const seed = getSecretSeed();
  let best = null;
  for (let oy = 0; oy < BASE_TILE; oy++) for (let ox = 0; ox < BASE_TILE; ox++) {
    const correlation = new Array(TOTAL_BITS).fill(0);
    const pixelCount = new Array(TOTAL_BITS).fill(0);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const bitIndex = bitIndexForPixel(x, y, width, height);
      const pn = pnValue(seed, bitIndex, (x+ox)%BASE_TILE, (y+oy)%BASE_TILE);
      const b = (y*width+x)*channels;
      let luma = 0;
      for (let c = 0; c < RGB_CHANNELS; c++) luma += data[b+c];
      luma /= RGB_CHANNELS;
      correlation[bitIndex] += luma * pn;
      pixelCount[bitIndex] += 1;
    }
    const avgAbs = correlation.reduce((s,c,i)=>s+Math.abs(c)/pixelCount[i],0)/TOTAL_BITS;
    if (!best || avgAbs > best.confidence) {
      const recovered = correlation.map((s,i)=>(s/pixelCount[i]>0?1:0));
      best = { code: bitsToHex(recovered), confidence: avgAbs };
    }
  }
  return best;
}

const imgPath = process.argv[2];
const expectedCodes = process.argv.slice(3);
const buf = fs.readFileSync(imgPath);
const result = await extractInvisibleCode(buf);
console.log("Recovered:", result);
for (const code of expectedCodes) {
  console.log(`  distance to ${code}: ${hammingDistance(result.code, code)}/24`);
}

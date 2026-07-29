import "server-only";
import sharp from "sharp";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Repeats the label diagonally across the whole image so cropping one
// corner (Taurina's single-corner watermark could be cropped out) no longer
// removes it. This visible mark is intentionally just a faint "this copy is
// tracked" signal now, not the forensic layer — real leak detection is the
// invisible watermark (lib/watermark/invisible.ts) via the admin
// upload-and-check tool, which is unaffected by how light this is. That
// division of labor is what lets this stay nearly imperceptible without
// giving up any real traceability.
function buildTiledSvgOverlay(
  label: string,
  width: number,
  height: number,
): string {
  const safeLabel = escapeXml(label);
  const tileWidth = 320;
  const tileHeight = 170;
  const cols = Math.ceil(width / tileWidth) + 2;
  const rows = Math.ceil(height / tileHeight) + 2;

  const texts: string[] = [];
  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const x = col * tileWidth + (row % 2 === 0 ? 0 : tileWidth / 2);
      const y = row * tileHeight;
      texts.push(
        `<text x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})" ` +
          `font-family="monospace" font-size="16" fill="#ffffff" fill-opacity="0.07">` +
          `${safeLabel}</text>`,
      );
    }
  }

  return (
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    texts.join("") +
    `</svg>`
  );
}

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

// Composites the visible tiled watermark and returns raw decoded pixels
// (RGB, no alpha) instead of encoding straight to JPEG. This is the one spot
// in the pipeline where the invisible forensic watermark (see
// lib/watermark/invisible.ts) also needs to run — on these same raw pixels,
// before the single final JPEG encode — so there's only one lossy
// generation instead of two.
export async function compositeVisibleWatermarkRaw(
  imageBuffer: Buffer,
  opts: { userId: string; sessionId: string; timestamp: string },
): Promise<RawImage> {
  const label = `${opts.userId.slice(0, 8)} · ${opts.sessionId.slice(0, 8)} · ${opts.timestamp}`;

  const base = sharp(imageBuffer).rotate(); // rotate() with no args normalizes EXIF orientation
  const meta = await base.metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 600;

  const overlaySvg = buildTiledSvgOverlay(label, width, height);

  const { data, info } = await base
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, channels: info.channels };
}

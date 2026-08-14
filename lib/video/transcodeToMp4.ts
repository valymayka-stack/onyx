import "server-only";
import { randomUUID } from "node:crypto";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Installed via nixpacks.toml (aptPkgs = ["ffmpeg"]) rather than the
// ffmpeg-static npm package — that package downloads a prebuilt binary via
// a postinstall script, which silently went missing from the deployed
// container (ENOENT at runtime, no build-time failure to catch it). A real
// apt package is part of the image itself, not a postinstall side effect.
const FFMPEG_PATH = "ffmpeg";

// Shared by /api/studio/upload-video (admin/creator uploads) and
// /api/bot/mirror-channel-post (Telegram->Onyx mirroring) — one ffmpeg
// invocation, not two that could drift apart. Transcodes any input video to
// H.264/AAC in an .mp4 container, universally playable regardless of the
// source format/codec (see upload-video's own comment for why this exists).
export async function transcodeToMp4(input: Buffer): Promise<Buffer> {
  const jobId = randomUUID();
  const inputPath = path.join(tmpdir(), `${jobId}-in`);
  const outputPath = path.join(tmpdir(), `${jobId}-out.mp4`);

  try {
    await writeFile(inputPath, input);

    await execFileAsync(
      FFMPEG_PATH,
      [
        "-y",
        "-i", inputPath,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 20 },
    );

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

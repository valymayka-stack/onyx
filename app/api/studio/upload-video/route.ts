import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeCollectionOwner } from "@/lib/studio/authorizeCollection";
import { MAX_UPLOAD_BYTES } from "@/lib/uploadLimits";
import { transcodeToMp4 } from "@/lib/video/transcodeToMp4";

// Video files upload here instead of straight to Storage from the browser
// (see CollectionAddPhotos.tsx) — a phone's raw export (.MOV/HEVC and
// similar) plays fine on the device that recorded it but not in the
// non-Safari browsers most fans actually use, which don't even attempt
// playback once the stored Content-Type says "video/quicktime". Transcoding
// server-side to H.264/AAC in an .mp4 container here means every video that
// ever reaches a collection is universally playable, regardless of what
// format it was recorded in.
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const collectionId = formData?.get("collectionId");
  const file = formData?.get("file");
  if (typeof collectionId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "missing collectionId or file" }, { status: 400 });
  }

  const auth = await authorizeCollectionOwner(collectionId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  try {
    const outputBuffer = await transcodeToMp4(Buffer.from(await file.arrayBuffer()));
    const storagePath = `${auth.collection.creator_id}/collections/${collectionId}/${randomUUID()}.mp4`;

    const { error: uploadError } = await auth.admin.storage
      .from("content-raw")
      .upload(storagePath, outputBuffer, { contentType: "video/mp4" });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    return NextResponse.json({ storagePath });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "no se pudo procesar el video" },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const THUMB_WIDTH = 480;

// Lightweight counterpart to /api/content/[itemId] for admin/studio preview
// grids only — those pages already grant full plaintext access to whoever's
// looking (the owning creator or an admin), so there's nothing to watermark
// or forensically mark here, and no realistic abuse vector to rate-limit
// against. The real route's per-request tiled watermark + invisible-mark
// embedding is expensive on purpose (defends fan-facing delivery), but that
// same cost run in parallel across a whole grid of thumbnails is exactly
// what was making these grids show up as broken images — this route does
// one cheap resize and nothing else. Session-cookie gated, no signed token:
// an <img> tag already carries the viewer's own cookies, and unlike the fan
// route this never needs to survive being copy-pasted outside the page.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select("id, creator_id, storage_path, content_type")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  const isOwnerCreator = item.creator_id === user.id;

  if (!isAdmin && !isOwnerCreator) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (item.content_type !== "image") {
    // Video preview isn't implemented here, and a text post has no
    // storage_path at all — .storage.download(null) below would throw
    // rather than 404/501 cleanly, which is what was rendering as a
    // broken-image icon in the admin/studio thumbnail grids.
    return NextResponse.json(
      { error: `${item.content_type} preview not implemented` },
      { status: 501 },
    );
  }

  const { data: fileBlob, error: downloadError } = await admin.storage
    .from("content-raw")
    .download(item.storage_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "storage read failed" }, { status: 500 });
  }

  const originalBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const thumbnail = await sharp(originalBuffer)
    .rotate() // rotate() with no args normalizes EXIF orientation — without
    // it, phone photos with an EXIF orientation tag (rather than pixels
    // actually rotated) render sideways here, same fix already applied in
    // lib/watermark/tile.ts for the fan-facing delivery path
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return new NextResponse(new Uint8Array(thumbnail), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}

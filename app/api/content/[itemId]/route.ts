import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyContentToken } from "@/lib/signing/contentToken";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { compositeVisibleWatermarkRaw } from "@/lib/watermark/tile";
import { generateCode, embedInvisibleCode } from "@/lib/watermark/invisible";
import { getRequestIp } from "@/lib/security/requestIp";

const CONTENT_REQUEST_LIMIT_PER_MINUTE = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const token = request.nextUrl.searchParams.get("t");
  const ip = getRequestIp(request);

  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const verified = verifyContentToken(token);
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 403 });
  }

  if (verified.itemId !== itemId) {
    return NextResponse.json({ error: "token/item mismatch" }, { status: 403 });
  }

  // Confirm the token's embedded user matches the actual current session —
  // defense against a token being replayed by a different logged-in user.
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || user.id !== verified.userId) {
    return NextResponse.json({ error: "session mismatch" }, { status: 403 });
  }

  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    userId: user.id,
    actionType: "content_request",
    windowMinutes: 1,
  });
  if (attemptCount >= CONTENT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { userId: user.id, ip, actionType: "content_request" });

  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select("id, creator_id, storage_path, content_type, is_hidden, collection_id, is_cover")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Belt-and-suspenders re-check over RLS: the service-role client bypasses
  // RLS entirely, so authorization must be re-verified explicitly here.
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  const isOwnerCreator = item.creator_id === user.id;

  let hasPurchase = false;

  if (item.collection_id && !isAdmin && !isOwnerCreator) {
    // Collection photos have their own, stricter gate: an explicit allowlist
    // grant, independent of any creator-wide subscription. Absent a grant,
    // this collection doesn't exist as far as this fan is concerned — 404,
    // not 403, same "can't distinguish hidden from never-existed" reasoning
    // already used for is_hidden below.
    const { data: grant } = await admin
      .from("collection_access_grants")
      .select("id")
      .eq("collection_id", item.collection_id)
      .eq("fan_id", user.id)
      .maybeSingle();
    if (!grant) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { data: purchase } = await admin
      .from("collection_purchases")
      .select("id")
      .eq("collection_id", item.collection_id)
      .eq("fan_id", user.id)
      .eq("status", "approved")
      .maybeSingle();
    hasPurchase = !!purchase;
  }

  let authorized = isAdmin || isOwnerCreator || !!item.collection_id;
  if (!authorized) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, ends_at")
      .eq("fan_id", user.id)
      .eq("creator_id", item.creator_id)
      .eq("status", "active")
      .gt("ends_at", new Date().toISOString())
      .maybeSingle();
    authorized = !!sub;
  }

  if (!authorized) {
    return NextResponse.json({ error: "not subscribed" }, { status: 403 });
  }

  // Admin-hidden content: 404 rather than 403 so a fan can't distinguish
  // "hidden by moderation" from "never existed." The owning creator/admin
  // can still preview it (e.g. to check what was flagged).
  if (item.is_hidden && !isAdmin && !isOwnerCreator) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (item.content_type === "video") {
    return NextResponse.json(
      { error: "video delivery not implemented yet" },
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

  // Collection photo, allowlisted but not purchased, and not the free cover:
  // an OF-style blurred teaser instead of the full watermarked delivery. No
  // forensic marking here — a heavily downscaled/blurred preview isn't the
  // asset worth protecting, so it's not worth the complexity.
  if (item.collection_id && !item.is_cover && !hasPurchase && !isAdmin && !isOwnerCreator) {
    const blurred = await sharp(originalBuffer)
      .resize(500)
      .blur(20)
      .jpeg({ quality: 60 })
      .toBuffer();

    return new NextResponse(new Uint8Array(blurred), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const {
    data: { session },
  } = await sessionClient.auth.getSession();
  const sessionId = session?.access_token
    ? createHash("sha256").update(session.access_token).digest("hex").slice(0, 8)
    : "unknown";

  const raw = await compositeVisibleWatermarkRaw(originalBuffer, {
    userId: user.id,
    sessionId,
    timestamp: new Date().toISOString(),
  });

  // Invisible forensic mark: a short code embedded in the raw pixels (see
  // lib/watermark/invisible.ts), logged here so a suspected leaked image can
  // later be traced back to exactly this delivery. Retry on the rare
  // unique-constraint collision rather than failing the whole request.
  let deliveryCode = generateCode();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error: markError } = await admin.from("content_delivery_marks").insert({
      code: deliveryCode,
      item_id: item.id,
      user_id: user.id,
      session_id: sessionId,
      ip,
    });
    if (!markError) break;
    deliveryCode = generateCode();
  }

  embedInvisibleCode(raw.data, raw.width, raw.height, raw.channels, deliveryCode);

  const watermarked = await sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: raw.channels as 3 },
  })
    .jpeg({ quality: 88 })
    .toBuffer();

  return new NextResponse(new Uint8Array(watermarked), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
}

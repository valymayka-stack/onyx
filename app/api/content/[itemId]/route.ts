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
import { countDistinctItemsRecent, DISTINCT_ITEM_LOG_THRESHOLD } from "@/lib/security/bulkDownloadDetector";

const CONTENT_REQUEST_LIMIT_PER_MINUTE = 150;

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

  // A Range header only ever shows up on a seek/buffer continuation of a
  // video already being played (see the proxying below) — the initial
  // request for any item, video included, never sends one. Exempting these
  // from the "new content request" counter keeps normal seeking/scrubbing
  // from burning through the same 60/min budget meant for someone fetching
  // many *different* items.
  const isRangeContinuation = request.headers.get("range") !== null;
  if (!isRangeContinuation) {
    const attemptCount = await countRecentAttempts(admin, {
      userId: user.id,
      actionType: "content_request",
      windowMinutes: 1,
    });
    if (attemptCount >= CONTENT_REQUEST_LIMIT_PER_MINUTE) {
      return NextResponse.json({ error: "rate limited" }, { status: 429 });
    }
    await logAttempt(admin, { userId: user.id, ip, actionType: "content_request" });
  }

  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select(
      "id, creator_id, storage_path, content_type, is_hidden, collection_id, is_cover, publish_at",
    )
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

  if (item.collection_id && !isAdmin && !isOwnerCreator) {
    // Collection photos have their own, stricter gate: an explicit allowlist
    // grant, independent of any creator-wide subscription. Absent a grant,
    // this collection doesn't exist as far as this fan is concerned — 404,
    // not 403, same "can't distinguish hidden from never-existed" reasoning
    // already used for is_hidden below. A grant unlocks the collection in
    // full — there's no separate purchase/unlock step.
    const { data: grant } = await admin
      .from("collection_access_grants")
      .select("id, expires_at")
      .eq("collection_id", item.collection_id)
      .eq("fan_id", user.id)
      .maybeSingle();
    const grantExpired = !!grant?.expires_at && new Date(grant.expires_at) <= new Date();
    if (!grant || grantExpired) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
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

  // Scheduled-but-not-yet-published content: same 404-not-403 treatment —
  // the feed already filters these out, this is defense in depth against a
  // fan who somehow got a signed token to an item before its publish_at.
  if (item.publish_at && new Date(item.publish_at) > new Date() && !isAdmin && !isOwnerCreator) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // No watermarking for video, deliberately — there's no per-viewer marking
  // pipeline for it (the visible/invisible marks are both image-pixel
  // operations), so a video is delivered as uploaded to whoever the checks
  // above already authorized.
  //
  // This used to redirect the browser straight to a signed Storage URL
  // instead of proxying the bytes — cheaper, and lets the <video> tag do its
  // own Range requests against Storage directly. Extending that URL's TTL
  // from 120s to 3600s (2026-08, see git history) fixed it for some cases,
  // but fans on Android kept reporting videos going gray/stuck even after
  // that — Android WebView's video pipeline (backed by ExoPlayer, not a
  // plain browser tab) is known to handle a 307-redirected, token-signed
  // video src unreliably. Proxying here removes the redirect entirely: the
  // <video src> always points at this same-origin route, and Range requests
  // (verified Storage honors them correctly — 206 + Content-Range) are
  // forwarded through rather than the client ever seeing the Storage URL.
  if (item.content_type === "video") {
    const { data: signed, error: signError } = await admin.storage
      .from("content-raw")
      .createSignedUrl(item.storage_path, 3600);
    if (signError || !signed) {
      return NextResponse.json({ error: "storage read failed" }, { status: 500 });
    }

    const range = request.headers.get("range");
    let upstream: Response;
    try {
      upstream = await fetch(signed.signedUrl, range ? { headers: { Range: range } } : undefined);
    } catch {
      return NextResponse.json({ error: "storage read failed" }, { status: 502 });
    }

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "storage read failed" }, { status: 502 });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") ?? "video/mp4");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "private, no-store");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  }

  // Bulk-download logging (2026-08): no longer auto-bans — a fan legitimately
  // assigned many collections crosses the same distinctItemCount threshold
  // as an actual scraper within one normal browsing session, so this was
  // banning real customers. Still logged for the admin to review by hand;
  // see app/(admin)/admin/security/page.tsx.
  if (!isAdmin) {
    const distinctItemCount = await countDistinctItemsRecent(admin, user.id);
    if (distinctItemCount >= DISTINCT_ITEM_LOG_THRESHOLD) {
      await admin.from("security_events").insert({
        event_type: "bulk_download_suspected",
        user_id: user.id,
        ip,
        user_agent: request.headers.get("user-agent"),
        metadata: { distinctItemCount },
      });
    }
  }

  const { data: fileBlob, error: downloadError } = await admin.storage
    .from("content-raw")
    .download(item.storage_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "storage read failed" }, { status: 500 });
  }

  const originalBuffer = Buffer.from(await fileBlob.arrayBuffer());

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

  await embedInvisibleCode(raw.data, raw.width, raw.height, raw.channels, deliveryCode);

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

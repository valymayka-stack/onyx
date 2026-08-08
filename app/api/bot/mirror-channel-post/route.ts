import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { getRequestIp } from "@/lib/security/requestIp";
import { transcodeToMp4 } from "@/lib/video/transcodeToMp4";
import { MAX_UPLOAD_BYTES } from "@/lib/uploadLimits";

const BOT_REQUEST_LIMIT_PER_MINUTE = 60;

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Mirrors a post from a Telegram channel (currently just "grupo"/Exclusive
// Chivis) into its matching Onyx collection — the bot calls this the moment
// a channel_post actually publishes. Scheduled Telegram messages aren't
// special here: Telegram never tells bots about a pending scheduled
// message beforehand, only once it's actually live, so publish_at is
// always null — by the time this runs, the post is already meant to be
// visible. One call = one Onyx post: the bot only ever sends a single
// photo/video/text per call (confirmed with the operator — she posts one
// item at a time, never a multi-photo album), so there's no media-group
// batching to worry about; each call gets its own fresh post_group_id.
export async function POST(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    ip,
    actionType: "bot_mirror_channel_post",
    windowMinutes: 1,
  });
  if (attemptCount >= BOT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { ip, actionType: "bot_mirror_channel_post" });

  const formData = await request.formData().catch(() => null);
  const channelCode = formData?.get("channelCode");
  const contentType = formData?.get("contentType");
  const captionRaw = formData?.get("caption");
  const file = formData?.get("file");

  if (typeof channelCode !== "string" || !channelCode) {
    return NextResponse.json({ error: "channelCode es requerido" }, { status: 400 });
  }
  if (contentType !== "image" && contentType !== "video" && contentType !== "text") {
    return NextResponse.json({ error: "contentType inválido" }, { status: 400 });
  }
  const caption = typeof captionRaw === "string" && captionRaw.trim() ? captionRaw.trim() : null;

  if (contentType !== "text" && !(file instanceof File)) {
    return NextResponse.json({ error: "file es requerido para image/video" }, { status: 400 });
  }
  if (file instanceof File && file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const { data: collection } = await admin
    .from("content_collections")
    .select("id, creator_id")
    .eq("telegram_channel_code", channelCode)
    .maybeSingle();
  if (!collection) {
    return NextResponse.json(
      { error: "no existe ninguna colección con ese channelCode" },
      { status: 404 },
    );
  }

  const { data: consent } = await admin
    .from("consent_records")
    .select("id")
    .eq("granted_by", collection.creator_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!consent) {
    return NextResponse.json(
      { error: "la creadora no tiene un consent_record vigente" },
      { status: 500 },
    );
  }

  let storagePath: string | null = null;

  if (contentType === "video" && file instanceof File) {
    try {
      const outputBuffer = await transcodeToMp4(Buffer.from(await file.arrayBuffer()));
      storagePath = `${collection.creator_id}/collections/${collection.id}/${crypto.randomUUID()}.mp4`;
      const { error: uploadError } = await admin.storage
        .from("content-raw")
        .upload(storagePath, outputBuffer, { contentType: "video/mp4" });
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "no se pudo procesar el video" },
        { status: 500 },
      );
    }
  } else if (contentType === "image" && file instanceof File) {
    const ext = file.name.split(".").pop() || "jpg";
    storagePath = `${collection.creator_id}/collections/${collection.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("content-raw")
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "image/jpeg",
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
  }

  const { data: item, error: insertError } = await admin
    .from("content_items")
    .insert({
      creator_id: collection.creator_id,
      storage_path: storagePath,
      content_type: contentType,
      is_premium: true,
      collection_id: collection.id,
      is_cover: false,
      consent_record_id: consent.id,
      caption,
      publish_at: null,
      post_group_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, itemId: item.id });
}

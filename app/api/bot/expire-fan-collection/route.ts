import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { getRequestIp } from "@/lib/security/requestIp";
import { findFanIdByEmail } from "@/lib/admin/findFanByEmail";

const BOT_REQUEST_LIMIT_PER_MINUTE = 60;

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Called by the bot's daily expiry sweep for any channel with has_expiry set
// — unlike normal collections (permanent grant), a channel like "Exclusive
// Chivis" expires, and the bot is the source of truth for when. This never
// deletes the grant row: the fan still needs to see a "renew" prompt in the
// feed instead of the collection just vanishing, which only works if Onyx
// still knows they once had access. Fails closed (404, no side effects) for
// any channelCode that doesn't map to an Onyx collection — the bot doesn't
// need to know which of its channels are Onyx-linked, it can just call this
// for every expired has_expiry channel and let this route no-op otherwise.
export async function POST(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const telegramId =
    typeof body?.telegramId === "string" ? body.telegramId.trim() : "";
  const channelCode =
    typeof body?.channelCode === "string" ? body.channelCode.trim() : "";

  if (!telegramId || !channelCode) {
    return NextResponse.json(
      { error: "telegramId y channelCode son requeridos" },
      { status: 400 },
    );
  }

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    ip,
    actionType: "bot_expire_fan_collection",
    windowMinutes: 1,
  });
  if (attemptCount >= BOT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { ip, actionType: "bot_expire_fan_collection" });

  const { data: collection } = await admin
    .from("content_collections")
    .select("id")
    .eq("telegram_channel_code", channelCode)
    .maybeSingle();
  if (!collection) {
    return NextResponse.json({ error: "no existe ninguna colección con ese channelCode" }, { status: 404 });
  }

  const email = `${telegramId}@onyx.com`;
  const fanId = await findFanIdByEmail(admin, email);
  if (!fanId) {
    return NextResponse.json({ error: "no existe ninguna cuenta con ese telegramId" }, { status: 404 });
  }

  const { error: updateError } = await admin
    .from("collection_access_grants")
    .update({ expires_at: new Date().toISOString() })
    .eq("collection_id", collection.id)
    .eq("fan_id", fanId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

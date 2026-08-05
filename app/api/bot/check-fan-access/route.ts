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

// Read-only counterpart to provision-fan.ts — used by the bot's channel
// migration/sweep commands to ask "does this telegramId already have Onyx
// access for these channels" without side effects (no account creation, no
// granting). Distinguishes channelCodes that don't match any Onyx collection
// at all (unknownCodes) from ones that do but simply aren't granted to this
// fan, so the bot can abort a migration run early with a clear reason
// instead of silently failing for every user in the channel.
export async function POST(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const telegramId =
    typeof body?.telegramId === "string" ? body.telegramId.trim() : "";
  const channelCodes = Array.isArray(body?.channelCodes)
    ? body.channelCodes.filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0)
    : [];

  if (!telegramId || channelCodes.length === 0) {
    return NextResponse.json(
      { error: "telegramId y channelCodes son requeridos" },
      { status: 400 },
    );
  }

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    ip,
    actionType: "bot_check_fan_access",
    windowMinutes: 1,
  });
  if (attemptCount >= BOT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { ip, actionType: "bot_check_fan_access" });

  const { data: collections } = await admin
    .from("content_collections")
    .select("id, telegram_channel_code")
    .in("telegram_channel_code", channelCodes);

  const known = collections ?? [];
  const knownCodes = new Set(known.map((c) => c.telegram_channel_code));
  const unknownCodes = channelCodes.filter((c: string) => !knownCodes.has(c));

  let granted: string[] = [];
  let loggedIn = false;
  const email = `${telegramId}@onyx.com`;
  const fanId = await findFanIdByEmail(admin, email);
  if (fanId) {
    if (known.length > 0) {
      const { data: grants } = await admin
        .from("collection_access_grants")
        .select("collection_id")
        .eq("fan_id", fanId)
        .in("collection_id", known.map((c) => c.id));
      const grantedIds = new Set((grants ?? []).map((g) => g.collection_id));
      granted = known
        .filter((c) => grantedIds.has(c.id))
        .map((c) => c.telegram_channel_code as string);
    }
    // Not channel-specific — a fan either has logged into Onyx at least once
    // or hasn't. Used by /forzar_corte_canal to tell "provisioned but never
    // actually used it" apart from "already using Onyx", which `granted`
    // alone can't do (a grant exists the moment the bot provisions someone,
    // regardless of whether they ever log in).
    const { data: profile } = await admin
      .from("profiles")
      .select("last_login_at")
      .eq("id", fanId)
      .maybeSingle();
    loggedIn = !!profile?.last_login_at;
  }

  return NextResponse.json({ granted, unknownCodes, loggedIn });
}

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

// Called by the bot right after it attempts to DM a fan their Onyx
// credentials/access note (approve_payment, /migrar_canal, /send_manual_link)
// — records whether the Telegram DM actually landed, since that's the one
// thing Onyx itself has no way to know on its own. Answers "why hasn't this
// account logged in yet" on the admin user page: never delivered (bot
// blocked) vs delivered-but-unused, instead of a blank "no inició sesión"
// either way.
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
    typeof body?.channelCode === "string" && body.channelCode.trim()
      ? body.channelCode.trim()
      : null;
  const status = body?.status;

  if (!telegramId || (status !== "sent" && status !== "blocked")) {
    return NextResponse.json(
      { error: "telegramId y status ('sent' | 'blocked') son requeridos" },
      { status: 400 },
    );
  }

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    ip,
    actionType: "bot_credential_delivery",
    windowMinutes: 1,
  });
  if (attemptCount >= BOT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { ip, actionType: "bot_credential_delivery" });

  const email = `${telegramId}@onyx.com`;
  const fanId = await findFanIdByEmail(admin, email);
  if (!fanId) {
    return NextResponse.json({ error: "fan not found" }, { status: 404 });
  }

  await admin.from("credential_deliveries").insert({
    fan_id: fanId,
    channel_code: channelCode,
    status,
  });

  return NextResponse.json({ ok: true });
}

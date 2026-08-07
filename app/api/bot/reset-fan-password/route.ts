import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { getRequestIp } from "@/lib/security/requestIp";
import { findFanIdByEmail } from "@/lib/admin/findFanByEmail";
import { TELEGRAM_ID_PATTERN } from "@/lib/admin/provisionFan";

const BOT_REQUEST_LIMIT_PER_MINUTE = 20;

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Called by the bot's /reset_password <telegram_id> admin command — the
// fan's original password is never recoverable (Supabase Auth only ever
// stores it hashed), so "forgot my password" only has one fix: set a new
// one. The bot generates the password (same secrets.token_urlsafe(12) it
// uses for first-time provisioning) and delivers it by DM itself; this
// route only performs the reset.
export async function POST(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const telegramId =
    typeof body?.telegramId === "string" ? body.telegramId.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!telegramId || !password) {
    return NextResponse.json(
      { error: "telegramId y password son requeridos" },
      { status: 400 },
    );
  }
  if (!TELEGRAM_ID_PATTERN.test(telegramId)) {
    return NextResponse.json({ error: "telegramId inválido" }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    ip,
    actionType: "bot_reset_fan_password",
    windowMinutes: 1,
  });
  if (attemptCount >= BOT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { ip, actionType: "bot_reset_fan_password" });

  const email = `${telegramId}@onyx.com`;
  const fanId = await findFanIdByEmail(admin, email);
  if (!fanId) {
    return NextResponse.json({ error: "no existe ninguna cuenta con ese telegramId" }, { status: 404 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(fanId, { password });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("security_events").insert({
    event_type: "admin_password_reset",
    user_id: fanId,
    ip,
    metadata: { via: "bot_reset_password_command" },
  });

  return NextResponse.json({ ok: true, email });
}

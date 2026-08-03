import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { getRequestIp } from "@/lib/security/requestIp";
import { ProvisionFanError } from "@/lib/admin/provisionFan";
import { provisionOrGrantFan } from "@/lib/admin/provisionOrGrantFan";

const BOT_REQUEST_LIMIT_PER_MINUTE = 20;

// Constant-time compare — a plain `===` leaks timing information proportional
// to how many leading characters match, which matters here since the secret
// is the entire trust boundary for this route (no user session at all).
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Called by the Telegram bot right after a purchase is approved for any
// collection except Grupo (which stays entirely on the Telegram side, no
// Onyx account involved). Self-serve signup is gone — this is now the only
// way a fan account gets created automatically. Auth is a shared secret
// header (BOT_PROVISION_SECRET), not a user session, since the bot has no
// Onyx session of its own.
//
// Idempotent by design: the bot calls this on every approval, whether the
// fan already has an Onyx account or not (see provisionOrGrantFan.ts) — the
// bot never has to track "does this telegramId already have Onyx creds"
// itself, and a repeat buyer keeps their existing password.
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
  const displayName =
    typeof body?.displayName === "string" ? body.displayName : undefined;
  const channelCode =
    typeof body?.channelCode === "string" && body.channelCode.trim()
      ? body.channelCode.trim()
      : undefined;

  if (!telegramId || !password) {
    return NextResponse.json(
      { error: "telegramId y password son requeridos" },
      { status: 400 },
    );
  }

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    ip,
    actionType: "bot_provision_fan",
    windowMinutes: 1,
  });
  if (attemptCount >= BOT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { ip, actionType: "bot_provision_fan" });

  try {
    const result = await provisionOrGrantFan({ telegramId, password, displayName, channelCode });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ProvisionFanError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "No se pudo crear la cuenta" },
      { status: 500 },
    );
  }
}

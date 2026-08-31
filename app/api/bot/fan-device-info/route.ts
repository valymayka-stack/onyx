import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { getRequestIp } from "@/lib/security/requestIp";

const BOT_REQUEST_LIMIT_PER_MINUTE = 20;
const MAX_TELEGRAM_IDS = 500;

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Read-only, bulk counterpart to check-fan-access's single-fan deviceType
// field — built for a bot dashboard's member list (e.g. Lore's, 2026-08-31)
// that needs device_type for many fans at once without an N+1 round trip
// per row. Never creates an account or grants anything; a telegramId with
// no Onyx account at all is simply absent from the response.
export async function POST(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const telegramIds = Array.isArray(body?.telegramIds)
    ? body.telegramIds.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  if (telegramIds.length === 0) {
    return NextResponse.json({ error: "telegramIds es requerido" }, { status: 400 });
  }
  if (telegramIds.length > MAX_TELEGRAM_IDS) {
    return NextResponse.json({ error: `máximo ${MAX_TELEGRAM_IDS} telegramIds por llamada` }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    ip,
    actionType: "bot_fan_device_info",
    windowMinutes: 1,
  });
  if (attemptCount >= BOT_REQUEST_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, { ip, actionType: "bot_fan_device_info" });

  // One listUsers call for the whole batch — same GoTrue limitation as
  // findFanIdByEmail (no admin "get user by email" call exists), but doing
  // it once here instead of once per telegramId is the whole point of this
  // endpoint existing separately from check-fan-access.
  const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) {
    return NextResponse.json({ error: "no se pudo consultar cuentas de Onyx" }, { status: 500 });
  }
  const idByEmail = new Map(
    usersPage.users
      .filter((u) => u.email)
      .map((u) => [u.email!.toLowerCase(), u.id]),
  );

  const fanIdByTelegramId = new Map<string, string>();
  for (const telegramId of telegramIds) {
    const fanId = idByEmail.get(`${telegramId}@onyx.com`);
    if (fanId) fanIdByTelegramId.set(telegramId, fanId);
  }

  const fanIds = [...fanIdByTelegramId.values()];
  const { data: profiles } =
    fanIds.length > 0
      ? await admin.from("profiles").select("id, device_type, last_login_at").in("id", fanIds)
      : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const result: Record<string, { deviceType: string | null; loggedIn: boolean }> = {};
  for (const telegramId of telegramIds) {
    const fanId = fanIdByTelegramId.get(telegramId);
    const profile = fanId ? profileById.get(fanId) : undefined;
    result[telegramId] = {
      deviceType: profile?.device_type ?? null,
      loggedIn: !!profile?.last_login_at,
    };
  }

  return NextResponse.json({ devices: result });
}

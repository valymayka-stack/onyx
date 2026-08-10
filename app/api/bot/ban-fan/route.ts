import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findFanIdByEmail } from "@/lib/admin/findFanByEmail";

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// The other half of the ban bridge: telegramBridge.ts's notifyBotOfBan()
// already pushes an Onyx-side ban out to the bot's /onyx/ban. This is the
// reverse leg — the bot's own /blacklist (and its /onyx/ban handler) call
// this so a Telegram-side block also locks the linked Onyx account, not
// just the channel. Terminal endpoint, not another hop: it does not call
// notifyBotOfBan, since the bot is the one that reached us.
export async function POST(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const telegramId = typeof body?.telegramId === "string" ? body.telegramId.trim() : "";
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "Bloqueado en Telegram";
  if (!telegramId) {
    return NextResponse.json({ error: "telegramId es requerido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const email = `${telegramId}@onyx.com`;
  const fanId = await findFanIdByEmail(admin, email);
  if (!fanId) {
    return NextResponse.json({ ok: true, suspended: false });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("banned_at")
    .eq("id", fanId)
    .maybeSingle();
  if (profile?.banned_at) {
    return NextResponse.json({ ok: true, suspended: false, alreadyBanned: true });
  }

  await admin.from("profiles").update({ banned_at: new Date().toISOString() }).eq("id", fanId);
  await admin
    .from("ban_history")
    .insert({ target_type: "user", target_value: fanId, action: "banned", reason });
  await admin.auth.admin.signOut(fanId, "global");

  return NextResponse.json({ ok: true, suspended: true });
}

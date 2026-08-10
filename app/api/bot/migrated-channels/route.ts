import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Lets the bot's own "Canales — Migración a Onyx" dashboard hide channels
// that already have a connected Onyx collection, so the operator only sees
// what's actually still pending — read-only, no side effects.
export async function GET(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("content_collections")
    .select("telegram_channel_code")
    .not("telegram_channel_code", "is", null);

  const codes = [...new Set((data ?? []).map((row) => row.telegram_channel_code as string))];
  return NextResponse.json({ codes });
}

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Called by a bot right after /add_set, so a new set's price stays in sync
// with Onyx's own price_cents (used by the in-app unlock feature) without
// the operator having to ask for it manually every time. No-ops (200, not an
// error) if the matching Onyx collection doesn't exist yet — the bot and
// Onyx sides are created independently, in whatever order the operator
// happens to do them, so "not found yet" is an expected, common case, not a
// failure the bot should retry or alert on.
export async function POST(request: NextRequest) {
  const secret = process.env.BOT_PROVISION_SECRET;
  const provided = request.headers.get("x-bot-secret");
  if (!secret || !provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const channelCode = body?.channelCode;
  const priceCents = body?.priceCents;
  if (typeof channelCode !== "string" || !channelCode || typeof priceCents !== "number") {
    return NextResponse.json({ error: "channelCode y priceCents son requeridos" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: collection } = await admin
    .from("content_collections")
    .select("id")
    .eq("telegram_channel_code", channelCode)
    .maybeSingle();

  if (!collection) {
    return NextResponse.json({ ok: true, synced: false, reason: "no matching collection yet" });
  }

  await admin.from("content_collections").update({ price_cents: priceCents }).eq("id", collection.id);

  return NextResponse.json({ ok: true, synced: true });
}

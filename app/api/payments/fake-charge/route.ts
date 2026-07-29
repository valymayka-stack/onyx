import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { charge } from "@/lib/payments/processor";

const SUBSCRIPTION_DAYS = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const creatorId = body?.creatorId;
  if (typeof creatorId !== "string") {
    return NextResponse.json({ error: "missing creatorId" }, { status: 400 });
  }

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: creator } = await admin
    .from("creators")
    .select("id, monthly_price_cents, active")
    .eq("id", creatorId)
    .maybeSingle();

  if (!creator || !creator.active) {
    return NextResponse.json({ error: "creator not found" }, { status: 404 });
  }

  // Reuse an existing pending/active row for this fan+creator pair instead
  // of inserting a duplicate — the partial unique index on
  // (fan_id, creator_id) where status in (pending, active) would reject a
  // second one anyway.
  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("fan_id", user.id)
    .eq("creator_id", creatorId)
    .in("status", ["pending", "active"])
    .maybeSingle();

  let subscriptionId = existingSub?.id;
  if (!subscriptionId) {
    const { data: newSub, error: subError } = await admin
      .from("subscriptions")
      .insert({ fan_id: user.id, creator_id: creatorId, status: "pending" })
      .select("id")
      .single();
    if (subError || !newSub) {
      return NextResponse.json(
        { error: "could not create subscription" },
        { status: 500 },
      );
    }
    subscriptionId = newSub.id;
  }

  const result = await charge({
    amountCents: creator.monthly_price_cents,
    fanId: user.id,
    creatorId,
  });

  await admin.from("payments").insert({
    subscription_id: subscriptionId,
    fan_id: user.id,
    creator_id: creatorId,
    amount_cents: creator.monthly_price_cents,
    processor: "fake",
    processor_reference: result.reference,
    status: result.approved ? "approved" : "rejected",
    raw_payload: result.raw as object,
    resolved_at: new Date().toISOString(),
  });

  if (!result.approved) {
    return NextResponse.json({ error: "payment not approved" }, { status: 402 });
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

  await admin
    .from("subscriptions")
    .update({
      status: "active",
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .eq("id", subscriptionId);

  return NextResponse.json({ ok: true, endsAt: endsAt.toISOString() });
}

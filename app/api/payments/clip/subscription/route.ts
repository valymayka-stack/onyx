import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckout } from "@/lib/payments/clipClient";
import { CROSS_SELL_LAUNCH_PRICE_CENTS } from "@/lib/feed/creatorAccess";

// Cross-creator Grupo/Club unlock — e.g. a Chivis fan buying Lore's Grupo
// VIP directly from "Explora más". Same subscription reuse logic as
// fake-charge/route.ts, but async: creates a pending payment + redirects to
// Clip's hosted checkout instead of resolving inline. Activation happens in
// the webhook (app/api/webhooks/clip-onyx/route.ts) once Clip confirms.
//
// Always charges CROSS_SELL_LAUNCH_PRICE_CENTS, not creator.monthly_price_cents
// (2026-09-05 launch discount) — this route only ever exists to unlock a
// creator the fan doesn't already have (see the eligibility check below,
// same one getUnlockableOtherCreators uses), so every real caller here is
// cold traffic by definition, not an existing subscriber renewing.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const targetCreatorId = body?.creatorId;
  if (typeof targetCreatorId !== "string") {
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
    .select("id, handle, monthly_price_cents, active")
    .eq("id", targetCreatorId)
    .maybeSingle();
  if (!creator || !creator.active) {
    return NextResponse.json({ error: "creator not found" }, { status: 404 });
  }

  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("fan_id", user.id)
    .eq("creator_id", targetCreatorId)
    .in("status", ["pending", "active"])
    .maybeSingle();

  if (existingSub?.status === "active") {
    return NextResponse.json({ error: "already subscribed" }, { status: 409 });
  }

  let subscriptionId = existingSub?.id;
  if (!subscriptionId) {
    const { data: newSub, error: subError } = await admin
      .from("subscriptions")
      .insert({ fan_id: user.id, creator_id: targetCreatorId, status: "pending" })
      .select("id")
      .single();
    if (subError || !newSub) {
      return NextResponse.json({ error: "could not create subscription" }, { status: 500 });
    }
    subscriptionId = newSub.id;
  }

  let checkout;
  try {
    checkout = await createCheckout({
      amountCents: CROSS_SELL_LAUNCH_PRICE_CENTS,
      // Deliberately generic (2026-09-04) — a statement descriptor naming the
      // creator/handle is both a privacy leak for the fan and a likely source
      // of confused-charge disputes ("no reconozco este cargo").
      description: "Acceso digital",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "clip checkout failed" },
      { status: 502 },
    );
  }

  await admin.from("payments").insert({
    subscription_id: subscriptionId,
    fan_id: user.id,
    creator_id: targetCreatorId,
    amount_cents: CROSS_SELL_LAUNCH_PRICE_CENTS,
    processor: "clip",
    processor_reference: checkout.paymentRequestId,
    status: "pending",
  });

  return NextResponse.json({ checkoutUrl: checkout.checkoutUrl });
}

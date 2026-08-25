import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckout } from "@/lib/payments/clipClient";

// One-time collection unlock — e.g. a Chivis fan buying one of her own
// additional priced sets from inside the app. Uses collection_purchases
// (schema'd in 0008_collections.sql, never actually wired to a real
// checkout route until now — self-serve collection purchases were built
// then deliberately disabled in favor of manual-only grants, per
// 0010_collections_no_price_gate.sql). Grant happens in the webhook once
// Clip confirms; no expiry, matches how a manually-delivered set works today.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const collectionId = body?.collectionId;
  if (typeof collectionId !== "string") {
    return NextResponse.json({ error: "missing collectionId" }, { status: 400 });
  }

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: collection } = await admin
    .from("content_collections")
    .select("id, title, creator_id, price_cents, is_hidden")
    .eq("id", collectionId)
    .maybeSingle();
  if (!collection || collection.is_hidden || !collection.price_cents) {
    return NextResponse.json({ error: "collection not found or not for sale" }, { status: 404 });
  }

  const { data: existingGrant } = await admin
    .from("collection_access_grants")
    .select("id")
    .eq("collection_id", collectionId)
    .eq("fan_id", user.id)
    .maybeSingle();
  if (existingGrant) {
    return NextResponse.json({ error: "already unlocked" }, { status: 409 });
  }

  const { data: pendingPurchase } = await admin
    .from("collection_purchases")
    .select("id, processor_reference")
    .eq("collection_id", collectionId)
    .eq("fan_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  let checkout;
  try {
    checkout = await createCheckout({
      amountCents: collection.price_cents,
      description: collection.title,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "clip checkout failed" },
      { status: 502 },
    );
  }

  if (pendingPurchase) {
    await admin
      .from("collection_purchases")
      .update({ processor_reference: checkout.paymentRequestId })
      .eq("id", pendingPurchase.id);
  } else {
    await admin.from("collection_purchases").insert({
      collection_id: collectionId,
      fan_id: user.id,
      creator_id: collection.creator_id,
      amount_cents: collection.price_cents,
      processor: "clip",
      processor_reference: checkout.paymentRequestId,
      status: "pending",
    });
  }

  return NextResponse.json({ checkoutUrl: checkout.checkoutUrl });
}

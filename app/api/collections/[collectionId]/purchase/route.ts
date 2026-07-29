import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { charge } from "@/lib/payments/processor";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;

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
    .select("id, creator_id, price_cents, is_hidden")
    .eq("id", collectionId)
    .maybeSingle();

  if (!collection || collection.is_hidden) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Can't buy what you can't see — the allowlist gate applies here too, not
  // just at delivery time.
  const { data: grant } = await admin
    .from("collection_access_grants")
    .select("id")
    .eq("collection_id", collectionId)
    .eq("fan_id", user.id)
    .maybeSingle();

  if (!grant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: existing } = await admin
    .from("collection_purchases")
    .select("id, status")
    .eq("collection_id", collectionId)
    .eq("fan_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, alreadyPurchased: true });
  }

  const { data: pending, error: pendingError } = await admin
    .from("collection_purchases")
    .insert({
      collection_id: collectionId,
      fan_id: user.id,
      creator_id: collection.creator_id,
      amount_cents: collection.price_cents,
      status: "pending",
    })
    .select("id")
    .single();

  if (pendingError || !pending) {
    return NextResponse.json({ error: "could not create purchase" }, { status: 500 });
  }

  const result = await charge({
    amountCents: collection.price_cents,
    fanId: user.id,
    creatorId: collection.creator_id,
  });

  await admin
    .from("collection_purchases")
    .update({
      status: result.approved ? "approved" : "rejected",
      processor_reference: result.reference,
      raw_payload: result.raw as object,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", pending.id);

  if (!result.approved) {
    return NextResponse.json({ error: "payment not approved" }, { status: 402 });
  }

  return NextResponse.json({ ok: true });
}

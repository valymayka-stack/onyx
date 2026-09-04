import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES, oversizedFileMessage } from "@/lib/uploadLimits";

// Fan-side alternative to Clip card checkout (2026-09-04) — same
// pending-subscription reuse logic as app/api/payments/clip/subscription/
// route.ts, so a fan can start here directly without ever hitting Clip, or
// finish here after abandoning a card checkout. Never grants anything
// itself — only stores the receipt for admin review
// (app/(admin)/admin/transfer-receipts), which calls activateSubscription
// the same way the Clip webhook does.
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const creatorId = formData?.get("creatorId");
  const file = formData?.get("file");
  if (typeof creatorId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "missing creatorId or file" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: oversizedFileMessage(file) }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "sube una foto del comprobante" }, { status: 400 });
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

  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("fan_id", user.id)
    .eq("creator_id", creatorId)
    .in("status", ["pending", "active"])
    .maybeSingle();
  if (existingSub?.status === "active") {
    return NextResponse.json({ error: "already subscribed" }, { status: 409 });
  }

  let subscriptionId = existingSub?.id;
  if (!subscriptionId) {
    const { data: newSub, error: subError } = await admin
      .from("subscriptions")
      .insert({ fan_id: user.id, creator_id: creatorId, status: "pending" })
      .select("id")
      .single();
    if (subError || !newSub) {
      return NextResponse.json({ error: "could not create subscription" }, { status: 500 });
    }
    subscriptionId = newSub.id;
  }

  const { data: existingReceipt } = await admin
    .from("manual_transfer_receipts")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingReceipt) {
    return NextResponse.json({ error: "ya tienes un comprobante en revisión" }, { status: 409 });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const storagePath = `${creatorId}/${user.id}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("payment-receipts")
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { error: insertError } = await admin.from("manual_transfer_receipts").insert({
    subscription_id: subscriptionId,
    fan_id: user.id,
    creator_id: creatorId,
    amount_cents: creator.monthly_price_cents,
    receipt_storage_path: storagePath,
    status: "pending",
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

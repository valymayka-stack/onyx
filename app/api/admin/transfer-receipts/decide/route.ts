import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { activateSubscription } from "@/lib/payments/activateSubscription";

// Approving here does exactly what the Clip webhook does on
// CHECKOUT_COMPLETED (via the shared activateSubscription helper), plus logs
// a payments row with processor "manual_transfer" so revenue reporting that
// reads `payments` picks these up too. Rejecting leaves the subscription
// "pending" — the fan can still retry by card or by uploading a new receipt.
export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const receiptId = typeof body?.receiptId === "string" ? body.receiptId : "";
  const decision = body?.decision;
  const reason = typeof body?.reason === "string" ? body.reason : null;
  if (!receiptId || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: receipt } = await admin
    .from("manual_transfer_receipts")
    .select("id, subscription_id, fan_id, creator_id, amount_cents, status")
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt || receipt.status !== "pending") {
    return NextResponse.json({ error: "not found or already reviewed" }, { status: 404 });
  }

  if (decision === "approve") {
    await activateSubscription(admin, {
      subscriptionId: receipt.subscription_id,
      fanId: receipt.fan_id,
      creatorId: receipt.creator_id,
    });
    await admin.from("payments").insert({
      subscription_id: receipt.subscription_id,
      fan_id: receipt.fan_id,
      creator_id: receipt.creator_id,
      amount_cents: receipt.amount_cents,
      processor: "manual_transfer",
      processor_reference: receiptId,
      status: "approved",
      resolved_at: new Date().toISOString(),
    });
  }

  await admin
    .from("manual_transfer_receipts")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: decision === "reject" ? reason : null,
    })
    .eq("id", receiptId);

  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCheckoutStatus } from "@/lib/payments/clipClient";
import { activateSubscription } from "@/lib/payments/activateSubscription";

// Clip's webhook for Onyx's own dedicated merchant account — separate path
// from any bot's webhook. Mirrors Taurina's proven pattern exactly: the POST
// body is only ever used to extract payment_request_id as a lookup key,
// never trusted for status/amount (Clip does not sign this webhook), always
// re-confirmed via an authenticated GET first.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const paymentRequestId = body?.payment_request_id;
  if (typeof paymentRequestId !== "string") {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  let status: string;
  try {
    status = await getCheckoutStatus(paymentRequestId);
  } catch {
    // Best-effort — Clip will retry the webhook, and we never acted on
    // anything from the unverified body, so there's nothing to roll back.
    return NextResponse.json({ ok: true });
  }

  const resolved = status === "CHECKOUT_COMPLETED" ? "approved" : "rejected";
  const isTerminal = status === "CHECKOUT_COMPLETED" || status === "CHECKOUT_CANCELLED" || status === "CHECKOUT_EXPIRED";
  if (!isTerminal) {
    return NextResponse.json({ ok: true });
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id, subscription_id, fan_id, creator_id, status")
    .eq("processor_reference", paymentRequestId)
    .maybeSingle();

  if (payment) {
    if (payment.status !== "pending") {
      return NextResponse.json({ ok: true }); // already resolved, idempotent no-op
    }

    await admin
      .from("payments")
      .update({ status: resolved, resolved_at: new Date().toISOString() })
      .eq("id", payment.id);

    if (resolved === "approved" && payment.subscription_id) {
      await activateSubscription(admin, {
        subscriptionId: payment.subscription_id,
        fanId: payment.fan_id,
        creatorId: payment.creator_id,
      });
    }

    return NextResponse.json({ ok: true });
  }

  const { data: purchase } = await admin
    .from("collection_purchases")
    .select("id, collection_id, fan_id, status")
    .eq("processor_reference", paymentRequestId)
    .maybeSingle();

  if (purchase) {
    if (purchase.status !== "pending") {
      return NextResponse.json({ ok: true });
    }

    await admin
      .from("collection_purchases")
      .update({ status: resolved, resolved_at: new Date().toISOString() })
      .eq("id", purchase.id);

    if (resolved === "approved") {
      await admin
        .from("collection_access_grants")
        .upsert(
          { collection_id: purchase.collection_id, fan_id: purchase.fan_id },
          { onConflict: "collection_id,fan_id", ignoreDuplicates: true },
        );
    }
  }

  return NextResponse.json({ ok: true });
}

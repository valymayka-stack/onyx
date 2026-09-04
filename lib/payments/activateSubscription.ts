import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUBSCRIPTION_DAYS = 30;

// Shared by the Clip webhook (app/api/webhooks/clip-onyx/route.ts) and the
// manual-transfer admin approval (app/api/admin/transfer-receipts/decide/
// route.ts) — both grant the exact same 30-day creator subscription + feed
// access, only the payment method that led here differs. One definition so
// the two paths can't quietly drift apart.
export async function activateSubscription(
  admin: SupabaseClient,
  input: { subscriptionId: string; fanId: string; creatorId: string },
): Promise<void> {
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

  await admin
    .from("subscriptions")
    .update({ status: "active", started_at: startedAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq("id", input.subscriptionId);

  const { data: feedCollection } = await admin
    .from("content_collections")
    .select("id")
    .eq("creator_id", input.creatorId)
    .eq("is_feed", true)
    .maybeSingle();

  if (feedCollection) {
    await admin
      .from("collection_access_grants")
      .upsert(
        { collection_id: feedCollection.id, fan_id: input.fanId },
        { onConflict: "collection_id,fan_id", ignoreDuplicates: true },
      );
  }
}

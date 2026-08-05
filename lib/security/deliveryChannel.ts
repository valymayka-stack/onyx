import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveryChannel = "telegram" | "app";

// Only iPhone/other-mobile (routed to Telegram) and the real Android app
// (routed to in-app viewing) ever actually consume content — Android
// browser and desktop are both pre-app/blocked holding states, so a fan
// stuck there hasn't "chosen" a channel yet and shouldn't trigger a switch.
export function contentChannelForDevice(
  deviceType: "android_app" | "android_browser" | "iphone" | "desktop" | "other_mobile",
): DeliveryChannel | null {
  if (deviceType === "iphone" || deviceType === "other_mobile") return "telegram";
  if (deviceType === "android_app") return "app";
  return null;
}

// collection_access_grants has no fan-select RLS policy (same reasoning as
// /feed and /telegram-access), so this always takes the admin client.
export async function fanBridgedChannelCodes(
  admin: SupabaseClient,
  fanId: string,
): Promise<string[]> {
  const { data: grantRows } = await admin
    .from("collection_access_grants")
    .select("content_collections(telegram_channel_code)")
    .eq("fan_id", fanId);

  return (grantRows ?? [])
    .map((g) => {
      const collection = g.content_collections as unknown as
        | { telegram_channel_code: string | null }[]
        | { telegram_channel_code: string | null }
        | null;
      const c = collection instanceof Array ? collection[0] : collection;
      return c?.telegram_channel_code ?? null;
    })
    .filter((code): code is string => Boolean(code));
}

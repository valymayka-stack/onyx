import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Real proof a fan has active access to a specific creator's content.
//
// Checks collection_access_grants — how every real fan's access is
// actually granted (the Telegram-bot provisioning flow writes here
// directly) — rather than Onyx's own `subscriptions` table, which is only
// ever populated by a direct in-app Clip subscription checkout. As of
// 2026-09 that checkout has never actually completed for a real fan (0
// rows in `subscriptions`, 0 real rows in `payments`), so using
// `subscriptions` as a gate meant the check was permanently false for
// 100% of real fans — the exact bug this replaces (found 2026-09-02: the
// in-app cross-creator unlock section had 0 views ever, for anyone,
// because of this).
//
// A grant with no expires_at is permanent/active. Errors fail closed
// (false) — same "never break the page, just don't show the extra
// section" posture as every other fire-and-forget check on these pages.
export async function hasActiveCreatorAccess(
  admin: SupabaseClient,
  fanId: string,
  creatorId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("collection_access_grants")
    .select("expires_at, content_collections(creator_id)")
    .eq("fan_id", fanId);

  if (error) {
    console.error("hasActiveCreatorAccess query failed", error);
    return false;
  }

  const now = Date.now();
  return (data ?? []).some((grant) => {
    const collection = grant.content_collections as unknown as
      | { creator_id: string }[]
      | { creator_id: string }
      | null;
    const matchesCreator = Array.isArray(collection)
      ? collection.some((c) => c.creator_id === creatorId)
      : collection?.creator_id === creatorId;
    if (!matchesCreator) return false;
    return !grant.expires_at || new Date(grant.expires_at).getTime() > now;
  });
}

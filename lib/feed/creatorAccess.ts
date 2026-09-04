import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueContentToken } from "@/lib/signing/contentToken";

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

// Which of these creator ids has a real, still-open Clip checkout attempt for
// this fan (subscriptions.status = 'pending' — created the moment they hit
// "Desbloquear", see app/api/payments/clip/subscription/route.ts). Used only
// to swap the unlock banner's copy for "you started this, finish it" instead
// of the generic pitch — the checkout itself is unchanged, and clicking
// UnlockButton again reuses the same pending subscription row (see that
// route's existingSub handling), so no separate retry plumbing is needed.
export async function getPendingSubscriptionCreatorIds(
  admin: SupabaseClient,
  fanId: string,
  creatorIds: string[],
): Promise<Set<string>> {
  if (creatorIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("subscriptions")
    .select("creator_id")
    .eq("fan_id", fanId)
    .eq("status", "pending")
    .in("creator_id", creatorIds);
  if (error) {
    console.error("getPendingSubscriptionCreatorIds query failed", error);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.creator_id as string));
}

export interface UnlockableCreator {
  id: string;
  handle: string;
  monthlyPriceCents: number;
  coverUrl: string | null;
  telegramLinkUrl: string | null;
}

// Shared by every place that offers "unlock this other creator" — right
// now app/(fan)/feed/colecciones/page.tsx (the pilot's original home) and
// app/(fan)/feed/page.tsx (the login-landing banner, 2026-09-04). One
// definition so they can never quietly disagree about who's eligible or
// what link/price to show, the exact risk the nav-badges/colecciones
// duplication already called out once. Returns only creators the fan
// doesn't already have active access to (via hasActiveCreatorAccess).
export async function getUnlockableOtherCreators(
  admin: SupabaseClient,
  fanId: string,
  otherCreatorIds: string[],
): Promise<UnlockableCreator[]> {
  const eligibleIds: string[] = [];
  for (const id of otherCreatorIds) {
    const alreadyHasAccess = await hasActiveCreatorAccess(admin, fanId, id);
    if (!alreadyHasAccess) eligibleIds.push(id);
  }
  if (eligibleIds.length === 0) return [];

  const { data: creators } = await admin
    .from("creators")
    .select("id, handle, monthly_price_cents")
    .in("id", eligibleIds)
    .eq("active", true);
  if (!creators || creators.length === 0) return [];

  const { data: feedCollections } = await admin
    .from("content_collections")
    .select("id, creator_id, cover_item_id")
    .in("creator_id", eligibleIds)
    .eq("is_feed", true);
  const feedCoverByCreator = new Map(
    (feedCollections ?? []).map((c) => [c.creator_id, c.cover_item_id as string | null]),
  );

  // Fallback for anyone who'd rather join the old way (transfer via
  // Telegram) than pay by card in-app — same link Explora más already uses
  // for this creator (see 0026_promo_card_creator_link.sql).
  const { data: promoLinks } = await admin
    .from("promo_cards")
    .select("creator_id, link_url")
    .in("creator_id", eligibleIds)
    .eq("is_active", true);
  const telegramLinkByCreator = new Map(
    (promoLinks ?? []).map((p) => [p.creator_id as string, p.link_url as string]),
  );

  return creators.map((c) => {
    const coverItemId = feedCoverByCreator.get(c.id);
    return {
      id: c.id,
      handle: c.handle,
      monthlyPriceCents: c.monthly_price_cents,
      coverUrl: coverItemId ? `/api/content/${coverItemId}?t=${issueContentToken(coverItemId, fanId)}` : null,
      telegramLinkUrl: telegramLinkByCreator.get(c.id) ?? null,
    };
  });
}

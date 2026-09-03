import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasActiveCreatorAccess } from "@/lib/feed/creatorAccess";

// Backs the small "new content" dots in FanNav — a stopgap ahead of real
// push notifications (2026-08). Two independent checks: is there a Grupo
// post newer than the fan's last visit to /feed, and is there a collection
// grant newer than their last visit to /feed/colecciones. Null last-seen
// (never visited) counts as "yes, show the dot" as long as there's
// anything at all — a brand-new fan should see both dots once there's
// something to see.
export async function GET() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("grupo_last_seen_at, collections_last_seen_at")
    .eq("id", user.id)
    .maybeSingle();

  const { data: grants } = await admin
    .from("collection_access_grants")
    .select("collection_id, created_at, expires_at, content_collections(is_feed)")
    .eq("fan_id", user.id);

  const now = new Date();
  const activeGrants = (grants ?? []).filter(
    (g) => !g.expires_at || new Date(g.expires_at) > now,
  );

  const feedCollectionIds = activeGrants
    .filter((g) => {
      const collection = g.content_collections as unknown as { is_feed: boolean }[] | { is_feed: boolean } | null;
      const isFeed = Array.isArray(collection) ? collection[0]?.is_feed : collection?.is_feed;
      return !!isFeed;
    })
    .map((g) => g.collection_id);

  let grupoHasNew = false;
  if (feedCollectionIds.length > 0) {
    const { data: latestPost } = await admin
      .from("content_items")
      .select("created_at")
      .in("collection_id", feedCollectionIds)
      .or("publish_at.is.null,publish_at.lte." + now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestPost) {
      grupoHasNew =
        !profile?.grupo_last_seen_at ||
        new Date(latestPost.created_at) > new Date(profile.grupo_last_seen_at);
    }
  }

  const classicGrants = activeGrants.filter((g) => {
    const collection = g.content_collections as unknown as { is_feed: boolean }[] | { is_feed: boolean } | null;
    const isFeed = Array.isArray(collection) ? collection[0]?.is_feed : collection?.is_feed;
    return !isFeed;
  });
  const latestGrantAt = classicGrants.reduce<string | null>(
    (max, g) => (!max || g.created_at > max ? g.created_at : max),
    null,
  );
  const coleccionesHasNew =
    !!latestGrantAt &&
    (!profile?.collections_last_seen_at ||
      new Date(latestGrantAt) > new Date(profile.collections_last_seen_at));

  // In-app unlocking pilot (2026-08): a dot for "there's something new you
  // could buy," independent of and additive to the "you were just granted
  // something" dot above — same nav destination (Colecciones, where both
  // sections render), so folding it into the same boolean is safe: it can
  // only ever make the existing dot show up in more cases, never fewer,
  // and never changes what the dot means for a fan who owns nothing new.
  // Chivis-fans-only pilot scope, same hardcoded ids as
  // app/(fan)/feed/colecciones/page.tsx — keep both in sync if this expands.
  const CHIVIS_CREATOR_ID = "b6650539-cf33-480d-a75e-7e6ef2acb255";
  const OTHER_CREATORS_TO_UNLOCK_IDS = ["6b5c169f-38cb-4d2d-856e-22a6cb379eb8"]; // Lore

  let hasUnlockable = false;
  // Same collection_access_grants-based check as
  // app/(fan)/feed/colecciones/page.tsx uses (lib/feed/creatorAccess.ts) —
  // not Onyx's own `subscriptions` table, which is only ever populated by a
  // direct in-app Clip checkout that (as of 2026-09) no real fan has ever
  // completed, making that gate permanently false for everyone. Keep this
  // in sync with that page — both must agree on who gets the pilot.
  const hasActiveChivisAccess = await hasActiveCreatorAccess(admin, user.id, CHIVIS_CREATOR_ID);

  if (hasActiveChivisAccess) {
    let hasOtherCreatorToUnlock = false;
    for (const id of OTHER_CREATORS_TO_UNLOCK_IDS) {
      const alreadyHasAccess = await hasActiveCreatorAccess(admin, user.id, id);
      if (!alreadyHasAccess) {
        hasOtherCreatorToUnlock = true;
        break;
      }
    }

    const ownedCollectionIds = activeGrants.map((g) => g.collection_id);
    const { count: unlockableCount } = await admin
      .from("content_collections")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", CHIVIS_CREATOR_ID)
      .eq("is_hidden", false)
      .eq("is_feed", false)
      .not("price_cents", "is", null)
      .not(
        "id",
        "in",
        `(${ownedCollectionIds.length > 0 ? ownedCollectionIds.join(",") : "00000000-0000-0000-0000-000000000000"})`,
      );

    hasUnlockable = hasOtherCreatorToUnlock || (unlockableCount ?? 0) > 0;
  }

  return NextResponse.json({ grupo: grupoHasNew, colecciones: coleccionesHasNew || hasUnlockable });
}

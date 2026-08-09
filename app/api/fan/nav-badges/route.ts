import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  return NextResponse.json({ grupo: grupoHasNew, colecciones: coleccionesHasNew });
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueContentToken } from "@/lib/signing/contentToken";

const PAGE_SIZE = 10;
// Rows are fetched, then grouped by post_group_id (see
// CollectionAddPhotos.tsx) — this cap just bounds one query's row count,
// generous enough to comfortably contain 10+ posts' worth of files.
const ROW_FETCH_CAP = 150;

export interface FeedItem {
  id: string;
  contentType: "image" | "video" | "text";
  url?: string;
}

export interface FeedPost {
  postGroupId: string;
  caption: string | null;
  createdAt: string;
  items: FeedItem[];
}

// Shared by app/(fan)/feed/page.tsx (server-rendered first page) and
// app/api/feed/grupo/route.ts (subsequent pages fetched client-side by
// GroupFeedViewer) — one cursor-pagination implementation, not two that can
// drift apart.
export async function getGrupoFeedPage(
  admin: SupabaseClient,
  userId: string,
  cursor: string | null,
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const now = new Date();

  const { data: grants } = await admin
    .from("collection_access_grants")
    .select("collection_id, expires_at")
    .eq("fan_id", userId);

  const activeGrantedIds = (grants ?? [])
    .filter((g) => !g.expires_at || new Date(g.expires_at) > now)
    .map((g) => g.collection_id);

  if (activeGrantedIds.length === 0) {
    return { posts: [], nextCursor: null };
  }

  const { data: feedCollections } = await admin
    .from("content_collections")
    .select("id")
    .eq("is_hidden", false)
    .eq("is_feed", true)
    .in("id", activeGrantedIds);

  const feedCollectionIds = (feedCollections ?? []).map((c) => c.id);
  if (feedCollectionIds.length === 0) {
    return { posts: [], nextCursor: null };
  }

  let query = admin
    .from("content_items")
    .select("id, collection_id, content_type, caption, publish_at, post_group_id, created_at")
    .in("collection_id", feedCollectionIds)
    .order("created_at", { ascending: false })
    .limit(ROW_FETCH_CAP);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: rows } = await query;
  const visibleRows = (rows ?? []).filter((r) => !r.publish_at || new Date(r.publish_at) <= now);

  const groupOrder: string[] = [];
  const groups = new Map<string, typeof visibleRows>();
  for (const row of visibleRows) {
    if (!groups.has(row.post_group_id)) {
      groupOrder.push(row.post_group_id);
      groups.set(row.post_group_id, []);
    }
    groups.get(row.post_group_id)!.push(row);
  }

  const pageGroupIds = groupOrder.slice(0, PAGE_SIZE);
  const hasMore = groupOrder.length > PAGE_SIZE || (rows ?? []).length === ROW_FETCH_CAP;

  let nextCursor: string | null = null;
  if (hasMore && pageGroupIds.length > 0) {
    const lastGroupRows = groups.get(pageGroupIds[pageGroupIds.length - 1]!)!;
    nextCursor = lastGroupRows.reduce(
      (min, r) => (r.created_at < min ? r.created_at : min),
      lastGroupRows[0]!.created_at,
    );
  }

  const posts: FeedPost[] = pageGroupIds.map((groupId) => {
    const groupRows = groups.get(groupId)!;
    const items: FeedItem[] = groupRows.map((r) => ({
      id: r.id,
      contentType: r.content_type as "image" | "video" | "text",
      url:
        r.content_type === "text"
          ? undefined
          : `/api/content/${r.id}?t=${issueContentToken(r.id, userId)}`,
    }));
    return {
      postGroupId: groupId,
      caption: groupRows[0]!.caption,
      createdAt: groupRows[0]!.created_at,
      items,
    };
  });

  return { posts, nextCursor };
}

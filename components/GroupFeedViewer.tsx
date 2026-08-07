"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CollectionPhotoViewer from "@/components/CollectionPhotoViewer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FeedItem {
  id: string;
  contentType: "image" | "video" | "text";
  url?: string;
}

interface FeedPost {
  postGroupId: string;
  caption: string | null;
  createdAt: string;
  items: FeedItem[];
  // Only ever set by the admin preview (app/(admin)/admin/collections/[id])
  // — the real fan feed never includes not-yet-published posts in the first
  // place, so this is always undefined there.
  scheduled?: boolean;
}

// Stacked, scroll-fed feed for Grupo/Exclusive Chivis — deliberately not the
// carousel used by CollectionPhotoViewer.tsx elsewhere (that one flattens a
// whole collection into one swipeable strip; this one is one card per post,
// growing as the fan scrolls). A media post's items all carry the same
// shared caption (see CollectionAddPhotos.tsx), so it's reused unchanged
// inside CollectionPhotoViewer for posts with more than one photo/video.
export default function GroupFeedViewer({
  initialPosts,
  initialNextCursor,
  paginated = true,
}: {
  initialPosts: FeedPost[];
  initialNextCursor: string | null;
  // The admin preview passes false: it renders every post for a collection
  // in one shot (own query, not scoped to the admin's own fan grants), so
  // there's no /api/feed/grupo cursor for it to page through.
  paginated?: boolean;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(paginated ? initialNextCursor : null);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed/grupo?cursor=${encodeURIComponent(cursor)}`);
      if (res.ok) {
        const data = await res.json();
        setPosts((prev) => [...prev, ...(data.posts ?? [])]);
        setCursor(data.nextCursor ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay ninguna publicación.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {posts.map((post) => (
        <Card key={post.postGroupId}>
          <CardContent className="flex flex-col gap-3">
            {post.scheduled && (
              <Badge variant="outline" className="w-fit">
                Programado — aún no visible para fans
              </Badge>
            )}
            {post.items[0]?.contentType === "text" ? (
              <p className="whitespace-pre-wrap text-sm text-foreground">{post.caption}</p>
            ) : (
              <CollectionPhotoViewer
                items={post.items.map((item) => ({
                  id: item.id,
                  url: item.url!,
                  isCover: false,
                  contentType: item.contentType as "image" | "video",
                  caption: post.caption ?? undefined,
                }))}
              />
            )}
          </CardContent>
        </Card>
      ))}

      {cursor && <div ref={sentinelRef} className="h-4" />}
      {loading && <p className="text-center text-xs text-muted-foreground">Cargando más…</p>}
    </div>
  );
}

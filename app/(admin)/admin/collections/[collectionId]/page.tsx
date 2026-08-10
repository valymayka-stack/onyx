import { notFound } from "next/navigation";
import { VideoOff, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueContentToken } from "@/lib/signing/contentToken";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import CollectionAddPhotos from "@/components/CollectionAddPhotos";
import CollectionGrantsManager from "@/components/CollectionGrantsManager";
import CollectionEditForm from "@/components/CollectionEditForm";
import GroupFeedViewer from "@/components/GroupFeedViewer";
import SetCoverButton from "@/components/SetCoverButton";
import DeleteContentButton from "@/components/DeleteContentButton";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Admin counterpart to /studio/collections/[collectionId] — same page, same
// child components (they already work under admin RLS bypass policies), just
// without the `creator_id = auth.uid()` ownership filter, and the consent
// record looked up by the collection's own creator instead of the session
// user (an admin has no consent record of their own).
export default async function AdminManageCollectionPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;
  const supabase = await createClient();
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();

  const { data: collection } = await supabase
    .from("content_collections")
    .select(
      "id, title, description, cover_item_id, creator_id, telegram_channel_code, is_feed, creators(handle)",
    )
    .eq("id", collectionId)
    .maybeSingle();

  if (!collection) notFound();

  const creator = (
    collection.creators as unknown as { handle: string }[] | { handle: string } | null
  ) instanceof Array
    ? (collection.creators as unknown as { handle: string }[])[0]
    : (collection.creators as unknown as { handle: string } | null);

  const { data: consent } = await supabase
    .from("consent_records")
    .select("id")
    .eq("granted_by", collection.creator_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: items } = await supabase
    .from("content_items")
    .select("id, is_cover, created_at, content_type, caption, publish_at, post_group_id")
    .eq("collection_id", collectionId)
    .order("is_cover", { ascending: false })
    .order("created_at", { ascending: false });

  // Feed preview: groups the same rows into posts the way the real Grupo
  // feed would (see lib/feed/grupoFeed.ts), but — unlike the fan-facing
  // feed — includes not-yet-published posts too (tagged "Programado"), so
  // the admin can check scheduled content before it goes live, without
  // needing the gated Android device the real fan feed requires.
  let feedPreviewPosts: {
    postGroupId: string;
    caption: string | null;
    createdAt: string;
    scheduled: boolean;
    items: { id: string; contentType: "image" | "video" | "text"; url?: string }[];
  }[] = [];
  if (collection.is_feed && sessionUser) {
    const now = new Date();
    const groupOrder: string[] = [];
    const groups = new Map<string, NonNullable<typeof items>>();
    for (const row of items ?? []) {
      if (!groups.has(row.post_group_id)) {
        groupOrder.push(row.post_group_id);
        groups.set(row.post_group_id, []);
      }
      groups.get(row.post_group_id)!.push(row);
    }
    feedPreviewPosts = groupOrder.map((groupId) => {
      const rows = groups.get(groupId)!;
      return {
        postGroupId: groupId,
        caption: rows[0]!.caption,
        createdAt: rows[0]!.created_at,
        scheduled: !!rows[0]!.publish_at && new Date(rows[0]!.publish_at) > now,
        items: rows.map((r) => ({
          id: r.id,
          contentType: r.content_type as "image" | "video" | "text",
          url:
            r.content_type === "text"
              ? undefined
              : `/api/content/${r.id}?t=${issueContentToken(r.id, sessionUser.id)}`,
        })),
      };
    });
  }

  const { data: grantRows } = await supabase
    .from("collection_access_grants")
    .select("fan_id")
    .eq("collection_id", collectionId);

  const admin = createAdminClient();
  const fanIds = (grantRows ?? []).map((g) => g.fan_id);
  let grants: { fanId: string; email: string | null; displayName: string | null }[] = [];
  if (fanIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", fanIds);
    const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    grants = fanIds.map((fanId) => ({
      fanId,
      email: usersPage?.users.find((u) => u.id === fanId)?.email ?? null,
      displayName: profiles?.find((p) => p.id === fanId)?.display_name ?? null,
    }));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader
        title={collection.title}
        subtitle={`@${creator?.handle ?? "—"} · ${items?.length ?? 0} foto(s)`}
      />
      <AdminNav />

      {collection.is_feed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa del feed</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupFeedViewer
              initialPosts={feedPreviewPosts}
              initialNextCursor={null}
              paginated={false}
            />
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Fotos</h2>
        <div className="grid grid-cols-3 gap-2">
          {(items ?? []).map((item) => {
            return (
              <div key={item.id} className="flex flex-col gap-1">
                <div className="relative">
                  {item.content_type === "video" ? (
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <VideoOff className="size-5" />
                    </div>
                  ) : item.content_type === "text" ? (
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileText className="size-5" />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/admin-thumb/${item.id}`}
                      alt=""
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  )}
                  {item.is_cover && (
                    <Badge className="absolute left-1 top-1" variant="secondary">
                      portada
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between gap-1">
                  {!item.is_cover && (
                    <SetCoverButton collectionId={collectionId} itemId={item.id} />
                  )}
                  <DeleteContentButton itemId={item.id} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {consent && (
        <CollectionAddPhotos
          collectionId={collectionId}
          creatorId={collection.creator_id}
          consentRecordId={consent.id}
          isFeed={collection.is_feed}
        />
      )}

      <CollectionGrantsManager collectionId={collectionId} grants={grants} />

      <CollectionEditForm
        collectionId={collectionId}
        initialTitle={collection.title}
        initialDescription={collection.description}
        isAdmin
        initialTelegramChannelCode={collection.telegram_channel_code ?? ""}
        initialIsFeed={collection.is_feed}
      />

      <DeleteAccountButton
        endpoint="/api/admin/delete-collection"
        bodyKey="collectionId"
        id={collectionId}
        confirmText={collection.title}
        redirectTo="/admin/collections"
        buttonLabel="Eliminar colección permanentemente"
        warningDetail={`Esto elimina la colección "${collection.title}" (${items?.length ?? 0} foto(s)), sus fotos, y el acceso otorgado a cualquier fan.`}
      />
    </main>
  );
}

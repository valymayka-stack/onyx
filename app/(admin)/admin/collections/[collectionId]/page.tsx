import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueContentToken } from "@/lib/signing/contentToken";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import CollectionAddPhotos from "@/components/CollectionAddPhotos";
import CollectionGrantsManager from "@/components/CollectionGrantsManager";
import CollectionEditForm from "@/components/CollectionEditForm";
import SetCoverButton from "@/components/SetCoverButton";
import DeleteContentButton from "@/components/DeleteContentButton";
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
    data: { user },
  } = await supabase.auth.getUser();

  const { data: collection } = await supabase
    .from("content_collections")
    .select("id, title, description, cover_item_id, creator_id, creators(handle)")
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
    .select("id, is_cover, created_at")
    .eq("collection_id", collectionId)
    .order("is_cover", { ascending: false })
    .order("created_at", { ascending: false });

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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Fotos</h2>
        <div className="grid grid-cols-3 gap-2">
          {(items ?? []).map((item) => {
            const token = issueContentToken(item.id, user!.id);
            return (
              <div key={item.id} className="flex flex-col gap-1">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/content/${item.id}?t=${token}`}
                    alt=""
                    className="aspect-square w-full rounded-lg object-cover"
                  />
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

      {consent && <CollectionAddPhotos collectionId={collectionId} consentRecordId={consent.id} />}

      <CollectionGrantsManager collectionId={collectionId} grants={grants} />

      <CollectionEditForm
        collectionId={collectionId}
        initialTitle={collection.title}
        initialDescription={collection.description}
      />
    </main>
  );
}

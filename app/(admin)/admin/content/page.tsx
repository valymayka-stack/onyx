import { VideoOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import HideToggleButton from "@/components/admin/HideToggleButton";
import DeleteContentButton from "@/components/DeleteContentButton";
import AdminAddPhotoForm from "@/components/admin/AdminAddPhotoForm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function creatorHandleOf(
  relation: { handle: string }[] | { handle: string } | null,
): string {
  return (relation instanceof Array ? relation[0]?.handle : relation?.handle) ?? "—";
}

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  const supabase = await createClient();

  const { data: collections } = await supabase
    .from("content_collections")
    .select("id, title, creator_id, is_hidden, creators(handle)")
    .order("created_at", { ascending: false });

  const { data: items } = await supabase
    .from("content_items")
    .select(
      "id, storage_path, content_type, is_premium, is_hidden, collection_id, is_cover, created_at, creator_id, creators(handle)",
    )
    .order("is_cover", { ascending: false })
    .order("created_at", { ascending: false });

  const creatorIds = Array.from(new Set((items ?? []).map((i) => i.creator_id)));
  const { data: consentRows } = await supabase
    .from("consent_records")
    .select("id, granted_by")
    .in("granted_by", creatorIds.length > 0 ? creatorIds : ["00000000-0000-0000-0000-000000000000"])
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const consentByCreator = new Map<string, string>();
  for (const row of consentRows ?? []) {
    if (!consentByCreator.has(row.granted_by)) consentByCreator.set(row.granted_by, row.id);
  }

  const looseItems = (items ?? []).filter((i) => !i.collection_id);
  const itemsByCollection = new Map<string, typeof items>();
  for (const item of items ?? []) {
    if (!item.collection_id) continue;
    const list = itemsByCollection.get(item.collection_id) ?? [];
    list.push(item);
    itemsByCollection.set(item.collection_id, list);
  }

  function Thumb({
    itemId,
    contentType,
    isCover,
  }: {
    itemId: string;
    contentType: string;
    isCover?: boolean;
  }) {
    if (contentType === "video") {
      return (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <VideoOff className="size-5" />
        </div>
      );
    }
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/admin-thumb/${itemId}`}
          alt=""
          className="aspect-square w-full rounded-lg object-cover"
        />
        {isCover && (
          <Badge className="absolute left-1 top-1" variant="secondary">
            portada
          </Badge>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <AppHeader
        title="Contenido"
        subtitle={`${items?.length ?? 0} pieza(s) · ${collections?.length ?? 0} colección(es)`}
      />
      <AdminNav />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Colecciones privadas</h2>
        {collections && collections.length > 0 ? (
          collections.map((collection) => {
            const collectionItems = itemsByCollection.get(collection.id) ?? [];
            const consentId = consentByCreator.get(collection.creator_id);
            return (
              <Card key={collection.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{collection.title}</span>
                      <span className="text-muted-foreground">
                        @{creatorHandleOf(collection.creators)}
                      </span>
                      {collection.is_hidden && <Badge variant="destructive">oculta</Badge>}
                    </div>
                    {consentId && (
                      <AdminAddPhotoForm
                        creatorId={collection.creator_id}
                        collectionId={collection.id}
                        consentRecordId={consentId}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {collectionItems.map((item) => (
                      <div key={item.id} className="flex flex-col gap-1">
                        <Thumb itemId={item.id} contentType={item.content_type} isCover={item.is_cover} />
                        <div className="flex items-center justify-between gap-1">
                          <HideToggleButton itemId={item.id} hidden={item.is_hidden} />
                          <DeleteContentButton itemId={item.id} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay colecciones.</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Fotos sueltas</h2>
        {looseItems.length > 0 ? (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {looseItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                <Thumb itemId={item.id} contentType={item.content_type} />
                <p className="truncate text-xs text-muted-foreground">
                  @{creatorHandleOf(item.creators)}
                </p>
                <Badge variant={item.is_premium ? "default" : "secondary"}>
                  {item.is_premium ? "premium" : "público"}
                </Badge>
                <div className="flex items-center justify-between gap-1">
                  <HideToggleButton itemId={item.id} hidden={item.is_hidden} />
                  <DeleteContentButton itemId={item.id} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin contenido todavía.</p>
        )}
      </section>
    </main>
  );
}

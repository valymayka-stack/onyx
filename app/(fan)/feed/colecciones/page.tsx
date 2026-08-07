import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueContentToken } from "@/lib/signing/contentToken";
import AppHeader from "@/components/AppHeader";
import FanNav from "@/components/FanNav";
import ProtectedContentGuard from "@/components/ProtectedContentGuard";
import CollectionConsentGate from "@/components/CollectionConsentGate";
import CollectionPhotoViewer from "@/components/CollectionPhotoViewer";
import { Card, CardContent } from "@/components/ui/card";

// The classic, non-feed collection view — this is exactly what /feed used
// to render before Grupo/Exclusive Chivis got its own infinite-scroll feed
// (see app/(fan)/feed/page.tsx). Only change: filtered to is_feed = false,
// so feed-mode collections never show up here as a duplicate carousel.
export default async function ColeccionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Collections have no fan-select RLS policy (existence is only ever
  // surfaced after an explicit allowlist check), so this goes through the
  // service-role client, same as the old per-creator page did.
  const admin = createAdminClient();

  const { data: myGrants } = await admin
    .from("collection_access_grants")
    .select("collection_id, expires_at")
    .eq("fan_id", user!.id);
  const allowedCollectionIds = (myGrants ?? []).map((g) => g.collection_id);
  const expiresAtByCollectionId = new Map(
    (myGrants ?? []).map((g) => [g.collection_id, g.expires_at as string | null]),
  );
  const now = new Date();
  const isExpired = (collectionId: string) => {
    const expiresAt = expiresAtByCollectionId.get(collectionId);
    return !!expiresAt && new Date(expiresAt) <= now;
  };

  const collections =
    allowedCollectionIds.length > 0
      ? (
          await admin
            .from("content_collections")
            .select("id, title, description, cover_item_id, is_hidden, is_feed, creators(handle)")
            .eq("is_hidden", false)
            .eq("is_feed", false)
            .in("id", allowedCollectionIds)
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  // Items are only fetched for collections the fan can still actually see —
  // an expired collection renders a renew prompt instead, so there's no
  // reason to pull its items or mint signed content tokens for it.
  const activeCollectionIds = collections.filter((c) => !isExpired(c.id)).map((c) => c.id);
  const { data: collectionItems } =
    activeCollectionIds.length > 0
      ? await admin
          .from("content_items")
          .select("id, collection_id, is_cover, content_type, caption, publish_at")
          .in("collection_id", activeCollectionIds)
          .order("is_cover", { ascending: false })
      : { data: [] };
  const visibleItems = (collectionItems ?? []).filter(
    (i) => !i.publish_at || new Date(i.publish_at) <= now,
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <FanNav />
      <AppHeader title="Colecciones" subtitle="Tus colecciones asignadas" />

      <ProtectedContentGuard>
        {collections.length > 0 ? (
          <section className="flex flex-col gap-8">
            {collections.map((collection) => {
              const creator = (
                collection.creators as unknown as { handle: string }[] | { handle: string } | null
              ) instanceof Array
                ? (collection.creators as unknown as { handle: string }[])[0]
                : (collection.creators as unknown as { handle: string } | null);

              const expired = isExpired(collection.id);

              const collectionItemsList = expired
                ? []
                : visibleItems
                    .filter((i) => i.collection_id === collection.id)
                    .map((item) => ({
                      id: item.id,
                      isCover: item.is_cover,
                      contentType: (item.content_type === "video" ? "video" : "image") as
                        | "image"
                        | "video",
                      caption: item.caption ?? undefined,
                      url: `/api/content/${item.id}?t=${issueContentToken(item.id, user!.id)}`,
                    }));

              // Nothing published yet for an active collection — same as not
              // having it at all, don't render an empty card. An expired
              // collection always renders (with the renew prompt below), even
              // though its item list here is intentionally empty.
              if (!expired && collectionItemsList.length === 0) return null;

              return (
                <CollectionConsentGate key={collection.id} collectionId={collection.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-4">
                      <div className="flex flex-col items-center gap-2 text-center">
                        {creator?.handle && (
                          <p className="text-sm text-muted-foreground">@{creator.handle}</p>
                        )}
                        <h3 className="font-[family-name:var(--font-display)] text-3xl italic tracking-tight">
                          {collection.title}
                        </h3>
                        {collection.description && (
                          <p className="max-w-md text-sm text-muted-foreground">
                            {collection.description}
                          </p>
                        )}
                      </div>

                      {expired ? (
                        <p className="rounded-lg border border-border/60 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                          Tu acceso venció — renueva tu suscripción para seguir disfrutando este
                          contenido.
                        </p>
                      ) : (
                        <CollectionPhotoViewer items={collectionItemsList} />
                      )}
                    </CardContent>
                  </Card>
                </CollectionConsentGate>
              );
            })}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no tienes ninguna colección asignada.
          </p>
        )}
      </ProtectedContentGuard>
    </main>
  );
}

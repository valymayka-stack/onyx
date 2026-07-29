import { Lock, VideoOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueContentToken } from "@/lib/signing/contentToken";
import AppHeader from "@/components/AppHeader";
import ProtectedContentGuard from "@/components/ProtectedContentGuard";
import SubscribeButton from "@/components/SubscribeButton";
import CollectionPurchaseButton from "@/components/CollectionPurchaseButton";
import CollectionConsentGate from "@/components/CollectionConsentGate";
import CollectionPhotoViewer from "@/components/CollectionPhotoViewer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Creator-wide subscriptions aren't being sold for now — access is granted
// per collection instead (see collection_access_grants), with payment
// happening outside this app. The subscription flow/code stays intact for
// later; this just keeps it out of the fan-facing UI until it's needed.
const SUBSCRIPTIONS_ENABLED = false;

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ creatorId: string }>;
}) {
  const { creatorId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: creator } = await supabase
    .from("creators")
    .select("id, handle, bio, monthly_price_cents")
    .eq("id", creatorId)
    .maybeSingle();

  if (!creator) {
    return (
      <main className="p-8">
        <p>Creador no encontrado.</p>
      </main>
    );
  }

  // Metadata-only listing via the service-role client so the fan sees a
  // locked preview grid even without an active subscription — the actual
  // bytes stay gated at /api/content/[itemId], which is the real
  // enforcement point regardless of what this page can see.
  const admin = createAdminClient();
  const { data: items } = await admin
    .from("content_items")
    .select("id, content_type, is_premium")
    .eq("creator_id", creatorId)
    .is("collection_id", null)
    .order("created_at", { ascending: false });

  const { data: activeSub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("fan_id", user!.id)
    .eq("creator_id", creatorId)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .maybeSingle();

  const isSubscribed = !!activeSub;
  const priceLabel = `$${(creator.monthly_price_cents / 100).toFixed(2)}/mes`;

  // Private collections: the allowlist is the actual privacy enforcement on
  // the read side — a collection this fan has no grant for is simply never
  // fetched, so it never renders, blurred or otherwise.
  const { data: myGrants } = await admin
    .from("collection_access_grants")
    .select("collection_id")
    .eq("fan_id", user!.id);
  const allowedCollectionIds = (myGrants ?? []).map((g) => g.collection_id);

  const collections =
    allowedCollectionIds.length > 0
      ? (
          await admin
            .from("content_collections")
            .select("id, title, description, price_cents, cover_item_id, is_hidden")
            .eq("creator_id", creatorId)
            .eq("is_hidden", false)
            .in("id", allowedCollectionIds)
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  const collectionIds = collections.map((c) => c.id);
  const { data: collectionItems } =
    collectionIds.length > 0
      ? await admin
          .from("content_items")
          .select("id, collection_id, is_cover")
          .in("collection_id", collectionIds)
          .order("is_cover", { ascending: false })
      : { data: [] };

  const { data: myPurchases } =
    collectionIds.length > 0
      ? await admin
          .from("collection_purchases")
          .select("collection_id")
          .eq("fan_id", user!.id)
          .eq("status", "approved")
          .in("collection_id", collectionIds)
      : { data: [] };
  const purchasedCollectionIds = new Set((myPurchases ?? []).map((p) => p.collection_id));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title={`@${creator.handle}`} subtitle={creator.bio ?? undefined} />

      {SUBSCRIPTIONS_ENABLED && (
        <div>
          <Badge variant="secondary">{priceLabel}</Badge>
        </div>
      )}

      {SUBSCRIPTIONS_ENABLED && !isSubscribed && (
        <SubscribeButton creatorId={creator.id} priceLabel={priceLabel} />
      )}

      <ProtectedContentGuard>
      {collections.length > 0 && (
        <section className="flex flex-col gap-8">
          {collections.map((collection) => {
            const purchased = purchasedCollectionIds.has(collection.id);
            const collectionItemsList = (collectionItems ?? [])
              .filter((i) => i.collection_id === collection.id)
              .map((item) => ({
                id: item.id,
                isCover: item.is_cover,
                url: `/api/content/${item.id}?t=${issueContentToken(item.id, user!.id)}`,
              }));

            return (
              <CollectionConsentGate key={collection.id} collectionId={collection.id}>
                <Card>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <h3 className="font-[family-name:var(--font-display)] text-3xl italic tracking-tight">
                        {collection.title}
                      </h3>
                      {collection.description && (
                        <p className="max-w-md text-sm text-muted-foreground">
                          {collection.description}
                        </p>
                      )}
                    </div>

                    <CollectionPhotoViewer items={collectionItemsList} />

                    {!purchased && (
                      <CollectionPurchaseButton collectionId={collection.id} />
                    )}
                  </CardContent>
                </Card>
              </CollectionConsentGate>
            );
          })}
        </section>
      )}

      {SUBSCRIPTIONS_ENABLED && (
        <section className="grid grid-cols-2 gap-4">
          {items && items.length > 0 ? (
            items.map((item) => {
              if (item.content_type === "video") {
                return (
                  <Card key={item.id} className="aspect-square">
                    <CardContent className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <VideoOff className="size-6" />
                      <p className="text-xs">Video (próximamente)</p>
                    </CardContent>
                  </Card>
                );
              }

              if (!isSubscribed) {
                return (
                  <Card key={item.id} className="aspect-square">
                    <CardContent className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Lock className="size-6" />
                      <p className="text-xs">Contenido bloqueado</p>
                    </CardContent>
                  </Card>
                );
              }

              const token = issueContentToken(item.id, user!.id);
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={item.id}
                  src={`/api/content/${item.id}?t=${token}`}
                  alt=""
                  className="aspect-square rounded-xl object-cover ring-1 ring-foreground/10"
                  draggable={false}
                />
              );
            })
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">
              Esta creadora todavía no sube contenido.
            </p>
          )}
        </section>
      )}
      </ProtectedContentGuard>
    </main>
  );
}

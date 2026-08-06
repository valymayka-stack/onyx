import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueContentToken } from "@/lib/signing/contentToken";
import AppHeader from "@/components/AppHeader";
import ProtectedContentGuard from "@/components/ProtectedContentGuard";
import CollectionConsentGate from "@/components/CollectionConsentGate";
import CollectionPhotoViewer from "@/components/CollectionPhotoViewer";
import { Card, CardContent } from "@/components/ui/card";

// No creator directory here on purpose: a fan only ever sees content that's
// been explicitly assigned to them (collection_access_grants), never a
// browsable list of every creator on the platform.
export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user!.id)
    .maybeSingle();

  // Collections have no fan-select RLS policy (existence is only ever
  // surfaced after an explicit allowlist check), so this goes through the
  // service-role client, same as the old per-creator page did.
  const admin = createAdminClient();

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
            .select("id, title, description, cover_item_id, is_hidden, creators(handle)")
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
          .select("id, collection_id, is_cover, content_type")
          .in("collection_id", collectionIds)
          .order("is_cover", { ascending: false })
      : { data: [] };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader
        title={`Hola, ${profile?.display_name ?? "fan"}`}
        subtitle="Tu contenido"
      />

      <ProtectedContentGuard>
        {collections.length > 0 ? (
          <section className="flex flex-col gap-8">
            {collections.map((collection) => {
              const creator = (
                collection.creators as unknown as { handle: string }[] | { handle: string } | null
              ) instanceof Array
                ? (collection.creators as unknown as { handle: string }[])[0]
                : (collection.creators as unknown as { handle: string } | null);

              const collectionItemsList = (collectionItems ?? [])
                .filter((i) => i.collection_id === collection.id)
                .map((item) => ({
                  id: item.id,
                  isCover: item.is_cover,
                  contentType: (item.content_type === "video" ? "video" : "image") as "image" | "video",
                  url: `/api/content/${item.id}?t=${issueContentToken(item.id, user!.id)}`,
                }));

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

                      <CollectionPhotoViewer items={collectionItemsList} />
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

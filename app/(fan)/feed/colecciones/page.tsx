import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueContentToken } from "@/lib/signing/contentToken";
import { hasActiveCreatorAccess, getUnlockableOtherCreators, type UnlockableCreator } from "@/lib/feed/creatorAccess";
import AppHeader from "@/components/AppHeader";
import FanNav from "@/components/FanNav";
import ProtectedContentGuard from "@/components/ProtectedContentGuard";
import CollectionConsentGate from "@/components/CollectionConsentGate";
import CollectionPhotoViewer from "@/components/CollectionPhotoViewer";
import UnlockButton from "@/components/UnlockButton";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// Pilot scope for in-app unlocking (Grupo cross-creator + colecciones
// sueltas): Chivis's own fans, seeing Lore's Grupo VIP under "Otras
// creadoras" plus Chivis's own extra priced collections below. Deliberately
// NOT called "Explora más" — that name is already taken by the pre-existing
// /feed/explora page (static promo cards linking out to Telegram, see
// 0018_promo_cards.sql), a completely different feature. Two different
// things sharing that name in the fan-facing app would be genuinely
// confusing, not just a cosmetic clash. Valentina is deliberately excluded
// from this section — no Onyx presence at all yet. Hardcoded to these two
// creator ids rather than a generic "every creator" system, matching the
// confirmed pilot scope — extend this list once more creators migrate.
const CHIVIS_CREATOR_ID = "b6650539-cf33-480d-a75e-7e6ef2acb255";
const OTHER_CREATORS_TO_UNLOCK_IDS = ["6b5c169f-38cb-4d2d-856e-22a6cb379eb8"]; // Lore

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

  // Fire-and-forget: clears the "new collection" dot in FanNav next time it
  // checks. Not awaited — nothing on this page depends on it completing.
  admin
    .from("profiles")
    .update({ collections_last_seen_at: new Date().toISOString() })
    .eq("id", user!.id)
    .then(({ error }) => {
      if (error) console.error("Failed to update collections_last_seen_at", error);
    });

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

  // "Explora más" + unlockable extra colecciones — pilot scope, Chivis's own
  // active fans only. Gated on a real collection_access_grants row (how
  // every real fan's access actually gets provisioned), not Onyx's own
  // `subscriptions` table — see lib/feed/creatorAccess.ts for why.
  const hasActiveChivisAccess = await hasActiveCreatorAccess(admin, user!.id, CHIVIS_CREATOR_ID);

  let otherCreatorsToUnlock: UnlockableCreator[] = [];
  let unlockableCollections: {
    id: string;
    title: string;
    priceCents: number;
    coverUrl: string | null;
  }[] = [];

  if (hasActiveChivisAccess) {
    otherCreatorsToUnlock = await getUnlockableOtherCreators(admin, user!.id, OTHER_CREATORS_TO_UNLOCK_IDS);

    if (otherCreatorsToUnlock.length > 0) {
      // Fire-and-forget view counters (2026-08-31) — same pattern as the
      // collections_last_seen_at update above: never awaited, errors only
      // logged, so a slow or failed increment can never affect what the fan
      // sees on this page.
      for (const creator of otherCreatorsToUnlock) {
        admin
          .rpc("increment_creator_unlock_view", { p_creator_id: creator.id })
          .then(({ error }) => {
            if (error) console.error("Failed to increment creator unlock view", error);
          });
      }
    }

    const { data: extraCollections } = await admin
      .from("content_collections")
      .select("id, title, cover_item_id, price_cents")
      .eq("creator_id", CHIVIS_CREATOR_ID)
      .eq("is_hidden", false)
      .eq("is_feed", false)
      .not("price_cents", "is", null)
      .not("id", "in", `(${allowedCollectionIds.length > 0 ? allowedCollectionIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
      .order("title", { ascending: true });

    unlockableCollections = (extraCollections ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      priceCents: c.price_cents as number,
      coverUrl: c.cover_item_id
        ? `/api/content/${c.cover_item_id}?t=${issueContentToken(c.cover_item_id, user!.id)}`
        : null,
    }));

    // Fire-and-forget, same as the creator counters above.
    for (const collection of unlockableCollections) {
      admin
        .rpc("increment_collection_unlock_view", { p_collection_id: collection.id })
        .then(({ error }) => {
          if (error) console.error("Failed to increment collection unlock view", error);
        });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <FanNav />
      <AppHeader title="Colecciones" subtitle="Tus colecciones asignadas" />

      <ProtectedContentGuard>
        {otherCreatorsToUnlock.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-destructive">✨ Otras creadoras</h2>
            {otherCreatorsToUnlock.map((creator) => (
              <Card key={creator.id} className="border-destructive/40 bg-destructive/5">
                <CardContent className="flex items-center gap-3">
                  {creator.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={creator.coverUrl}
                      alt=""
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">@{creator.handle}</p>
                    <p className="text-xs font-semibold text-destructive">
                      🔥{" "}
                      <span className="font-normal text-muted-foreground line-through">
                        ${(creator.monthlyPriceCents / 100).toFixed(0)}
                      </span>{" "}
                      ${(creator.launchPriceCents / 100).toFixed(0)} MXN
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {creator.telegramLinkUrl && (
                      <a
                        href={creator.telegramLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "default", size: "sm" })}
                      >
                        Únete por Telegram
                      </a>
                    )}
                    <UnlockButton
                      kind="subscription"
                      creatorId={creator.id}
                      label="O paga con tarjeta"
                      variant="outline"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {unlockableCollections.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-destructive">✨ Desbloquea más</h2>
            {unlockableCollections.map((collection) => (
              <Card key={collection.id} className="border-destructive/40 bg-destructive/5">
                <CardContent className="flex items-center gap-3">
                  {collection.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={collection.coverUrl}
                      alt=""
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{collection.title}</p>
                    <p className="text-xs text-muted-foreground">
                      ${(collection.priceCents / 100).toFixed(0)} MXN
                    </p>
                  </div>
                  <UnlockButton kind="collection" collectionId={collection.id} label="Desbloquear" />
                </CardContent>
              </Card>
            ))}
          </section>
        )}

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

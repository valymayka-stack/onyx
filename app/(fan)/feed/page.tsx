import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrupoFeedPage } from "@/lib/feed/grupoFeed";
import {
  hasActiveCreatorAccess,
  getUnlockableOtherCreators,
  getPendingSubscriptionCreatorIds,
} from "@/lib/feed/creatorAccess";
import AppHeader from "@/components/AppHeader";
import FanNav from "@/components/FanNav";
import ProtectedContentGuard from "@/components/ProtectedContentGuard";
import GroupFeedViewer from "@/components/GroupFeedViewer";
import UnlockButton from "@/components/UnlockButton";
import { Card, CardContent } from "@/components/ui/card";

// Same pilot scope as app/(fan)/feed/colecciones/page.tsx — keep this list
// in sync with that one (both must agree on who's eligible).
const CHIVIS_CREATOR_ID = "b6650539-cf33-480d-a75e-7e6ef2acb255";
const OTHER_CREATORS_TO_UNLOCK_IDS = ["6b5c169f-38cb-4d2d-856e-22a6cb379eb8"]; // Lore

// Landing page for fans — the infinite-scroll Grupo/Exclusive Chivis feed.
// "Inicio" in the drawer nav points here too (there's no separate home
// screen, confirmed with the operator). The classic carousel-style
// collections view that used to live at this route moved to
// /feed/colecciones, unchanged, so it stays visually untouched.
export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { posts, nextCursor, expired } = await getGrupoFeedPage(admin, user!.id, null);

  // Fire-and-forget: clears the "new post" dot in FanNav next time it
  // checks. Not awaited — nothing on this page depends on it completing.
  admin
    .from("profiles")
    .update({ grupo_last_seen_at: new Date().toISOString() })
    .eq("id", user!.id)
    .then(({ error }) => {
      if (error) console.error("Failed to update grupo_last_seen_at", error);
    });

  // Cross-creator unlock banner (2026-09-04) — shown on login/entry, not
  // just buried in Colecciones. Same pilot scope/eligibility as that page
  // (getUnlockableOtherCreators), so it only ever shows to a real active
  // Chivis fan who doesn't already have Lore, and agrees with Colecciones
  // on price/link/eligibility since both call the same function.
  const hasActiveChivisAccess = await hasActiveCreatorAccess(admin, user!.id, CHIVIS_CREATOR_ID);
  const otherCreatorsToUnlock = hasActiveChivisAccess
    ? await getUnlockableOtherCreators(admin, user!.id, OTHER_CREATORS_TO_UNLOCK_IDS)
    : [];

  // 2026-09-04: the Clip checkout used to show an unfamiliar business name
  // with no logo, a likely reason the first real attempts all abandoned at
  // that screen — now fixed on Clip's side. For a fan who already started
  // (and dropped) that checkout, swap the pitch for a "finish what you
  // started" nudge instead of repeating the generic offer.
  const pendingCreatorIds =
    otherCreatorsToUnlock.length > 0
      ? await getPendingSubscriptionCreatorIds(
          admin,
          user!.id,
          otherCreatorsToUnlock.map((c) => c.id),
        )
      : new Set<string>();

  // Same fire-and-forget view counter Colecciones already uses — a fan
  // seeing this banner counts as a view of that creator's unlock pitch
  // either way.
  for (const creator of otherCreatorsToUnlock) {
    admin
      .rpc("increment_creator_unlock_view", { p_creator_id: creator.id })
      .then(({ error }) => {
        if (error) console.error("Failed to increment creator unlock view (feed banner)", error);
      });
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <FanNav />
      <AppHeader title="Grupo" subtitle="Lo más reciente" />

      {otherCreatorsToUnlock.map((creator) => {
        const isPending = pendingCreatorIds.has(creator.id);
        return (
          <Card key={creator.id} className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex flex-col gap-2 text-center">
              {isPending ? (
                <>
                  <p className="text-sm font-medium">
                    ⏳ Tienes un pago incompleto para <span className="capitalize">{creator.handle}</span> VIP
                  </p>
                  <p className="text-xs text-muted-foreground">Complétalo ahora para no perder tu acceso</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    ✨ ¿Sabías que <span className="capitalize">{creator.handle}</span> VIP ya está aquí?
                  </p>
                  <p className="text-xs text-muted-foreground">Desbloquéala ahora</p>
                </>
              )}
              <div className="flex flex-col items-center gap-1.5">
                <UnlockButton
                  kind="subscription"
                  creatorId={creator.id}
                  label={isPending ? "Completar pago" : "Desbloquear"}
                />
                {creator.telegramLinkUrl && (
                  <a
                    href={creator.telegramLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    o contáctala aquí
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ProtectedContentGuard>
        {expired ? (
          <Card>
            <CardContent>
              <p className="rounded-lg border border-border/60 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                Tu acceso venció — renueva tu suscripción para seguir disfrutando este contenido.
              </p>
            </CardContent>
          </Card>
        ) : (
          <GroupFeedViewer initialPosts={posts} initialNextCursor={nextCursor} />
        )}
      </ProtectedContentGuard>
    </main>
  );
}

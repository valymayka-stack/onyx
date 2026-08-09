import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrupoFeedPage } from "@/lib/feed/grupoFeed";
import AppHeader from "@/components/AppHeader";
import FanNav from "@/components/FanNav";
import ProtectedContentGuard from "@/components/ProtectedContentGuard";
import GroupFeedViewer from "@/components/GroupFeedViewer";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <FanNav />
      <AppHeader title="Grupo" subtitle="Lo más reciente" />

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

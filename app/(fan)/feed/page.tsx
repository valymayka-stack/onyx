import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrupoFeedPage } from "@/lib/feed/grupoFeed";
import AppHeader from "@/components/AppHeader";
import FanNav from "@/components/FanNav";
import ProtectedContentGuard from "@/components/ProtectedContentGuard";
import GroupFeedViewer from "@/components/GroupFeedViewer";

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
  const { posts, nextCursor } = await getGrupoFeedPage(admin, user!.id, null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <FanNav />
      <AppHeader title="Grupo" subtitle="Lo más reciente" />

      <ProtectedContentGuard>
        <GroupFeedViewer initialPosts={posts} initialNextCursor={nextCursor} />
      </ProtectedContentGuard>
    </main>
  );
}

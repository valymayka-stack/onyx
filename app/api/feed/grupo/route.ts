import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrupoFeedPage } from "@/lib/feed/grupoFeed";

// Powers the infinite-scroll Grupo feed (GroupFeedViewer.tsx) for every page
// after the first (the first page is server-rendered directly in
// app/(fan)/feed/page.tsx using the same getGrupoFeedPage helper). Unlike
// /api/content/[itemId], this never serves file bytes — it only returns
// metadata plus short-lived signed content tokens, so the same rate limit
// content/[itemId] already enforces still applies once the browser actually
// fetches an image/video.
export async function GET(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get("cursor");

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const page = await getGrupoFeedPage(admin, user.id, cursor);
  return NextResponse.json(page);
}

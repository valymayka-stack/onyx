import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { getRequestIp } from "@/lib/security/requestIp";

// Real, irreversible delete — distinct from the hide/unhide toggle. Chosen
// deliberately (over reusing the reversible hide mechanism) for cleaning up
// genuine mistakes (wrong upload, wrong creator), so it removes both the
// storage object and the row rather than just flipping a flag. Available to
// admin (any item) and the owning creator (their own items only) — this
// route lives under /api/admin for historical reasons but the auth check
// below is the actual gate, not the URL.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const ip = getRequestIp(request);

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: item } = await admin
    .from("content_items")
    .select("id, storage_path, creator_id, collection_id, is_cover")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const isOwner = item.creator_id === user.id;
  if (!isOwner && !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: storageError } = await admin.storage
    .from("content-raw")
    .remove([item.storage_path]);
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin.from("content_items").delete().eq("id", itemId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (item.is_cover && item.collection_id) {
    await admin
      .from("content_collections")
      .update({ cover_item_id: null })
      .eq("id", item.collection_id);
  }

  await admin.from("security_events").insert({
    event_type: isOwner ? "creator_content_deleted" : "admin_content_deleted",
    user_id: user.id,
    ip,
    metadata: { itemId, storagePath: item.storage_path, creatorId: item.creator_id },
  });

  return NextResponse.json({ ok: true });
}

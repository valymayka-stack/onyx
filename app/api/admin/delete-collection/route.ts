import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { getRequestIp } from "@/lib/security/requestIp";

// Permanent delete for a whole collection. content_items,
// collection_access_grants, and collection_purchases all cascade on delete
// (0008_collections.sql), so only the collection row and its photos'
// storage objects need explicit cleanup here. Admin-only: unlike deleting a
// single photo, deleting a whole collection also revokes every fan's grant
// to it in one click, a bigger mistake to make than DeleteContentButton
// covers.
export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId : "";
  if (!collectionId) {
    return NextResponse.json({ error: "collectionId requerido" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: collection } = await admin
    .from("content_collections")
    .select("id, title")
    .eq("id", collectionId)
    .maybeSingle();

  if (!collection) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: items } = await admin
    .from("content_items")
    .select("storage_path")
    .eq("collection_id", collectionId);

  const storagePaths = (items ?? []).map((i) => i.storage_path);
  if (storagePaths.length > 0) {
    const { error: storageError } = await admin.storage.from("content-raw").remove(storagePaths);
    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await admin
    .from("content_collections")
    .delete()
    .eq("id", collectionId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await admin.from("security_events").insert({
    event_type: "admin_collection_deleted",
    user_id: user.id,
    ip,
    metadata: { collectionId, title: collection.title, itemCount: storagePaths.length },
  });

  return NextResponse.json({ ok: true });
}

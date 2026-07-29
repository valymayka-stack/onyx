import { NextResponse, type NextRequest } from "next/server";
import { authorizeCollectionOwner } from "@/lib/studio/authorizeCollection";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  const auth = await authorizeCollectionOwner(collectionId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const itemId = body?.itemId;
  if (typeof itemId !== "string") {
    return NextResponse.json({ error: "missing itemId" }, { status: 400 });
  }

  const { data: item } = await auth.admin
    .from("content_items")
    .select("id, collection_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item || item.collection_id !== collectionId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Exactly one cover per collection: clear the old one, then set the new one.
  await auth.admin
    .from("content_items")
    .update({ is_cover: false })
    .eq("collection_id", collectionId)
    .eq("is_cover", true);

  const { error: updateError } = await auth.admin
    .from("content_items")
    .update({ is_cover: true })
    .eq("id", itemId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auth.admin
    .from("content_collections")
    .update({ cover_item_id: itemId })
    .eq("id", collectionId);

  return NextResponse.json({ ok: true });
}

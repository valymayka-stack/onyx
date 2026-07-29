import { NextResponse, type NextRequest } from "next/server";
import { authorizeCollectionOwner } from "@/lib/studio/authorizeCollection";
import { findFanIdByEmail } from "@/lib/admin/findFanByEmail";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  const auth = await authorizeCollectionOwner(collectionId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const email = body?.email;
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "missing email" }, { status: 400 });
  }

  const fanId = await findFanIdByEmail(auth.admin, email.trim());
  if (!fanId) {
    return NextResponse.json({ error: "no existe un usuario con ese correo" }, { status: 404 });
  }

  const { data: isFan } = await auth.admin.from("fans").select("id").eq("id", fanId).maybeSingle();
  if (!isFan) {
    return NextResponse.json({ error: "esa cuenta no es un usuario (fan)" }, { status: 400 });
  }

  const { error: insertError } = await auth.admin
    .from("collection_access_grants")
    .upsert(
      { collection_id: collectionId, fan_id: fanId, granted_by: auth.user.id },
      { onConflict: "collection_id,fan_id" },
    );

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  const auth = await authorizeCollectionOwner(collectionId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const fanId = body?.fanId;
  if (typeof fanId !== "string") {
    return NextResponse.json({ error: "missing fanId" }, { status: 400 });
  }

  const { error: deleteError } = await auth.admin
    .from("collection_access_grants")
    .delete()
    .eq("collection_id", collectionId)
    .eq("fan_id", fanId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

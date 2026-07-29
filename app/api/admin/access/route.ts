import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { findFanIdByEmail } from "@/lib/admin/findFanByEmail";

// Reverse view of the per-collection allowlist: given a fan's email, list
// every collection across every creator with a hasAccess flag, so an admin
// can manage one fan's access in one place instead of hunting through each
// collection's own grants list.
export async function GET(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email?.trim()) {
    return NextResponse.json({ error: "missing email" }, { status: 400 });
  }

  const admin = createAdminClient();
  const fanId = await findFanIdByEmail(admin, email.trim());
  if (!fanId) {
    return NextResponse.json({ error: "no existe un usuario con ese correo" }, { status: 404 });
  }

  const { data: isFan } = await admin.from("fans").select("id").eq("id", fanId).maybeSingle();
  if (!isFan) {
    return NextResponse.json({ error: "esa cuenta no es un usuario (fan)" }, { status: 400 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", fanId)
    .maybeSingle();

  const [{ data: collections }, { data: grantRows }] = await Promise.all([
    admin
      .from("content_collections")
      .select("id, title, is_hidden, creators(handle)")
      .order("created_at", { ascending: false }),
    admin.from("collection_access_grants").select("collection_id").eq("fan_id", fanId),
  ]);

  const grantedIds = new Set((grantRows ?? []).map((g) => g.collection_id));

  return NextResponse.json({
    fan: { id: fanId, email: email.trim(), displayName: profile?.display_name ?? null },
    collections: (collections ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      isHidden: c.is_hidden,
      creatorHandle:
        (c.creators as unknown as { handle: string }[] | { handle: string } | null) instanceof
        Array
          ? (c.creators as unknown as { handle: string }[])[0]?.handle ?? "—"
          : (c.creators as unknown as { handle: string } | null)?.handle ?? "—",
      hasAccess: grantedIds.has(c.id),
    })),
  });
}

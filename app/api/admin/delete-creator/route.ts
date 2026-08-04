import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth/roles";
import { deleteCreatorAccount, DeleteAccountError } from "@/lib/admin/deleteAccount";

// Real, irreversible delete — wipes the creator's storage files, then the
// account (cascading every collection, photo row, and grant). Admin-only.
export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const creatorId = typeof body?.creatorId === "string" ? body.creatorId : "";
  if (!creatorId) {
    return NextResponse.json({ error: "creatorId es requerido" }, { status: 400 });
  }

  try {
    await deleteCreatorAccount(creatorId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DeleteAccountError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 500 });
  }
}

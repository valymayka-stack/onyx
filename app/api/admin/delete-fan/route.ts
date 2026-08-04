import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth/roles";
import { deleteFanAccount, DeleteAccountError } from "@/lib/admin/deleteAccount";

// Real, irreversible delete — distinct from BanToggleButton's suspend/
// reactivate. Admin-only.
export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const fanId = typeof body?.fanId === "string" ? body.fanId : "";
  if (!fanId) {
    return NextResponse.json({ error: "fanId es requerido" }, { status: 400 });
  }

  try {
    await deleteFanAccount(fanId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DeleteAccountError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 500 });
  }
}

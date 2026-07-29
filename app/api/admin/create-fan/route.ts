import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth/roles";
import { provisionFanAccount, ProvisionFanError } from "@/lib/admin/provisionFan";

// Manual counterpart to /api/bot/provision-fan — same underlying account
// creation, gated by an admin session instead of the bot's shared secret.
// Used when the admin creates a fan account by hand from /admin/users/new
// instead of waiting for the bot to do it after a purchase.
export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const telegramId =
    typeof body?.telegramId === "string" ? body.telegramId.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayName =
    typeof body?.displayName === "string" ? body.displayName : undefined;

  if (!telegramId || !password) {
    return NextResponse.json(
      { error: "telegramId y password son requeridos" },
      { status: 400 },
    );
  }

  try {
    const result = await provisionFanAccount({ telegramId, password, displayName });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ProvisionFanError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "No se pudo crear la cuenta" },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { notifyBotOfBan, telegramIdFromEmail } from "@/lib/security/telegramBridge";

// Backs BanToggleButton — moved from a direct client-side Supabase update to
// a server route for exactly one reason: a manual suspend needs to reach
// the bot (see notifyBotOfBan) so the admin gets the same "cuenta
// suspendida" DM in Telegram that an automatic ban already triggers via
// applyBan(). Reactivating stays silent — only suspending notifies.
export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user: sessionUser },
  } = await sessionClient.auth.getUser();

  if (!sessionUser || !(await hasRole(sessionClient, sessionUser.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const currentlyBanned = body?.banned === true;
  if (!userId) {
    return NextResponse.json({ error: "userId es requerido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowSuspending = !currentlyBanned;

  const { error: updateError } = await admin
    .from("profiles")
    .update({ banned_at: nowSuspending ? new Date().toISOString() : null })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (nowSuspending) {
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const telegramId = telegramIdFromEmail(userData?.user?.email);
    if (telegramId) {
      notifyBotOfBan(telegramId, "Suspendida manualmente por un administrador");
    }
  }

  return NextResponse.json({ ok: true });
}

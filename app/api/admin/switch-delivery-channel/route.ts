import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { telegramIdFromEmail, revokeTelegramAccess, resolveCreatorHandlesForFan } from "@/lib/security/telegramBridge";
import { fanBridgedChannelCodes, type DeliveryChannel } from "@/lib/security/deliveryChannel";

// Backs the (deliberately manual, admin-only) device-switch override —
// self-service switching was removed from middleware.ts entirely (2026-08):
// it was too easy to use as a way to spread one paid subscription's access
// across two devices/channels at once, one Telegram and one app. This is
// now the *only* way a fan's delivery_channel ever changes after their
// first device, and it's a deliberate, one-fan-at-a-time admin action, not
// something a fan can trigger just by opening the site on a new phone.
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
  if (!userId) {
    return NextResponse.json({ error: "userId es requerido" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const { data: profile } = await admin
    .from("profiles")
    .select("delivery_channel")
    .eq("id", userId)
    .maybeSingle();

  const currentChannel = profile?.delivery_channel as DeliveryChannel | null;
  if (!currentChannel) {
    return NextResponse.json(
      { error: "Este usuario todavía no tiene un canal de entrega asignado" },
      { status: 400 },
    );
  }
  const newChannel: DeliveryChannel = currentChannel === "app" ? "telegram" : "app";

  const bridgedCodes = await fanBridgedChannelCodes(admin, userId);
  if (bridgedCodes.length === 0) {
    return NextResponse.json(
      { error: "Este usuario no tiene ninguna colección con canal de Telegram" },
      { status: 400 },
    );
  }

  if (newChannel === "app") {
    // Moving off Telegram: kick them out and revoke the invite link before
    // granting the app side — same order middleware.ts used to follow, now
    // just triggered by an admin instead of the fan's own next request.
    const telegramId = telegramIdFromEmail(userData?.user?.email);
    if (telegramId) {
      const creatorHandles = await resolveCreatorHandlesForFan(admin, userId);
      if (creatorHandles.length === 0) {
        await revokeTelegramAccess(telegramId, bridgedCodes, null);
      } else {
        for (const handle of creatorHandles) {
          await revokeTelegramAccess(telegramId, bridgedCodes, handle);
        }
      }
    }
  }
  // app -> telegram needs no extra step here — landing on /telegram-access
  // already (re)requests a fresh invite, same as before.

  const { error: updateError } = await admin
    .from("profiles")
    .update({ delivery_channel: newChannel, device_switch_used_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, newChannel });
}

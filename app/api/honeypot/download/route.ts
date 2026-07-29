import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIp } from "@/lib/security/requestIp";
import { applyBan } from "@/lib/security/banCascade";

// The "Descargar" button has no legitimate function — no real user needs it,
// so a click is a strong, low-false-positive signal of intent to pirate.
// Clicking it bans the account, the IP, and the device fingerprint in one
// pass, then kills the session immediately.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const fingerprint =
    typeof body?.fingerprint === "string" ? body.fingerprint : null;
  const ip = getRequestIp(request);

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const admin = createAdminClient();

  await admin.from("security_events").insert({
    event_type: "honeypot_click",
    user_id: user.id,
    ip,
    user_agent: request.headers.get("user-agent"),
    device_fingerprint: fingerprint,
    metadata: { itemId: body?.itemId ?? null },
  });

  await applyBan(admin, {
    userId: user.id,
    ip,
    fingerprint,
    reason: "honeypot_click",
  });

  return NextResponse.json(
    {
      error: "policy_violation",
      message:
        "Esta acción está en contra de la política de uso. Tu cuenta ha sido suspendida.",
    },
    { status: 403 },
  );
}

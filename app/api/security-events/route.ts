import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { getRequestIp } from "@/lib/security/requestIp";
import { applyBan } from "@/lib/security/banCascade";

const EVENT_LIMIT_PER_MINUTE = 30;

// Any sign of DevTools triggers the same ban cascade as the honeypot.
// "devtools_key_blocked" (F12, Ctrl+Shift+I, etc.) is an explicit shortcut
// nobody hits by accident. "devtools_suspected" (viewport-size delta /
// debugger-timing heuristic) is intentionally included too, at the user's
// request — accepted trade-off: it can also fire from a resized window, a
// browser extension's side panel, or a slow machine, so this setting will
// occasionally ban someone who never opened DevTools.
const DEVTOOLS_BAN_EVENT_TYPES = new Set(["devtools_key_blocked", "devtools_suspected"]);

// Client telemetry (right-click/selection blocked, tab blur, DevTools
// suspected, honeypot clicks are handled by their own route). The row
// always carries the server-verified session user, never a client-supplied
// id — a hostile client could otherwise forge events under someone else's
// name.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.eventType) {
    return NextResponse.json({ error: "missing eventType" }, { status: 400 });
  }

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  const ip = getRequestIp(request);
  const admin = createAdminClient();

  const attemptCount = await countRecentAttempts(admin, {
    userId: user?.id,
    ip,
    actionType: "security_event",
    windowMinutes: 1,
  });
  if (attemptCount >= EVENT_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(admin, {
    userId: user?.id,
    ip,
    actionType: "security_event",
  });

  const fingerprint =
    typeof body.fingerprint === "string" ? body.fingerprint : null;

  await admin.from("security_events").insert({
    event_type: body.eventType,
    user_id: user?.id ?? null,
    ip,
    user_agent: request.headers.get("user-agent"),
    device_fingerprint: fingerprint,
    metadata: body.metadata ?? null,
  });

  if (user && DEVTOOLS_BAN_EVENT_TYPES.has(body.eventType)) {
    await applyBan(admin, {
      userId: user.id,
      ip,
      fingerprint,
      reason: body.eventType,
    });

    return NextResponse.json(
      {
        banned: true,
        message:
          "Se detectaron herramientas de desarrollador. Tu cuenta ha sido suspendida.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}

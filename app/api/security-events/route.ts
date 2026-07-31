import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";
import { getRequestIp } from "@/lib/security/requestIp";
import { applyBan } from "@/lib/security/banCascade";

const EVENT_LIMIT_PER_MINUTE = 30;

// Every one of these is a deliberate exfiltration attempt, not something a
// legitimate viewer does by accident — so each one bans on its own, no
// honeypot needed anymore:
// - devtools_key_blocked: explicit shortcut (F12, Ctrl+Shift+I, etc.)
// - devtools_suspected: viewport-size-delta / debugger-timing heuristic —
//   accepted trade-off, at the user's request: this can also fire from a
//   resized window, a browser extension's side panel, or a slow machine, so
//   it will occasionally ban someone who never opened DevTools.
// - drag_blocked: dragging the image out to another window/folder
// - selection_blocked: copying page content out of the guarded area
// - external_capture_suspected: sustained tab/window blur followed shortly
//   by a click once back — the indirect signal for "switched to a screen
//   recorder and came back to click through the photos." Same trade-off as
//   devtools_suspected: a slow return-and-click after any unrelated blur can
//   also trigger this.
// - automation_detected: navigator.webdriver — set by every mainstream
//   scraping framework (Puppeteer, Selenium, Playwright), never by a real
//   fan's own browser.
// - printscreen_key_detected: the one OS-level capture shortcut that does
//   reach the page (Windows PrintScreen, as a keyup) — Mac's Cmd+Shift+3/4/5
//   and Windows' Win+Shift+S are intercepted by the OS before any browser
//   ever sees them, so there's no equivalent event for those.
// right_click_blocked and save_or_print_blocked stay OUT of this set
// deliberately — those are things people reach for out of habit far more
// often than they mean anything by it.
//
// bulk_download_suspected is NOT posted through this route — it's detected
// directly in app/api/content/[itemId]/route.ts (too many distinct items
// requested in a short window) and bans immediately from there, since it's
// a signal the delivery path itself observes, not something the client
// reports.
const AUTO_BAN_EVENT_TYPES = new Set([
  "devtools_key_blocked",
  "devtools_suspected",
  "drag_blocked",
  "selection_blocked",
  "external_capture_suspected",
  "automation_detected",
  "printscreen_key_detected",
]);

// Client telemetry (right-click/drag/selection/blur blocked, DevTools
// suspected). The row always carries the server-verified session user, never
// a client-supplied id — a hostile client could otherwise forge events under
// someone else's name.
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

  if (user && AUTO_BAN_EVENT_TYPES.has(body.eventType)) {
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
          "Se detectó un intento de extraer contenido protegido. Tu cuenta ha sido suspendida.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}

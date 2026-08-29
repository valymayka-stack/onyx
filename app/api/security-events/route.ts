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
//   also trigger this. SUPPRESSED on Android app users specifically (see
//   isAndroidApp below) — checked against real ban_history data 2026-08-29:
//   56 of 59 fans ever banned by this signal were device_type=android_app,
//   where FLAG_SECURE already blocks the capture itself at the OS level (no
//   callback exists for Android to report a blocked attempt back to us, so
//   there's no ban-worthy signal to replace this with there — the OS-level
//   block is simply the whole defense on that platform now). Everywhere
//   else (iPhone stays on Telegram delivery, no in-app viewer exposure;
//   any future non-Android web/native surface) this keeps auto-banning
//   exactly as before.
// - automation_detected: navigator.webdriver — set by every mainstream
//   scraping framework (Puppeteer, Selenium, Playwright), never by a real
//   fan's own browser.
// - printscreen_key_detected: the one OS-level capture shortcut that does
//   reach the page (Windows PrintScreen, as a keyup) — Mac's Cmd+Shift+3/4/5
//   and Windows' Win+Shift+S are intercepted by the OS before any browser
//   ever sees them, so there's no equivalent event for those.
// - save_or_print_blocked: Ctrl/Cmd+S (save-page-as / download) and
//   Ctrl/Cmd+P (print-to-PDF, effectively another download path). Originally
//   left out deliberately (habit, not intent — see git history), but the
//   product decision changed: these are now treated as clear intent too,
//   at the cost of occasionally banning someone who hit Ctrl+P/S from pure
//   muscle memory with no intent to save anything.
// right_click_blocked stays OUT of this set — it alone still bans nobody,
// since it's the one signal that fires on completely passive browsing (no
// modifier key, no follow-through required).
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
  "save_or_print_blocked",
]);

// A single blur (tab/window switch) is too common to mean anything on its
// own — see external_capture_suspected above for the pattern that already
// catches the "went to set up a recorder" case. But repeated switching away
// and back, on its own, is also now a ban condition at the product's
// request: three or more within the window reads as someone shuttling
// between this tab and another app/device rather than one-off distraction.
const BLUR_WINDOW_MINUTES = 2;
const BLUR_BAN_THRESHOLD = 3;

async function countRecentBlurEvents(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  const since = new Date(Date.now() - BLUR_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "blur")
    .gte("created_at", since);
  return count ?? 0;
}

// The in-app unlock flow (Clip's redirect checkout) intentionally does the
// exact thing external_capture_suspected is built to catch: leave the app
// for several seconds, come back, tap something. Rather than weaken that
// signal generally, this checks for a REAL, server-recorded pending payment
// this same user just created — never a client-supplied "I'm paying" flag,
// which could otherwise be forged to evade real screen-recording detection.
const PAYMENT_GRACE_WINDOW_MINUTES = 10;

async function hasRecentPendingPayment(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - PAYMENT_GRACE_WINDOW_MINUTES * 60_000).toISOString();

  const [{ count: paymentCount }, { count: purchaseCount }] = await Promise.all([
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("fan_id", userId)
      .eq("status", "pending")
      .eq("processor", "clip")
      .gte("created_at", since),
    admin
      .from("collection_purchases")
      .select("id", { count: "exact", head: true })
      .eq("fan_id", userId)
      .eq("status", "pending")
      .eq("processor", "clip")
      .gte("created_at", since),
  ]);

  return (paymentCount ?? 0) > 0 || (purchaseCount ?? 0) > 0;
}

async function isAndroidApp(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("device_type")
    .eq("id", userId)
    .maybeSingle();
  return data?.device_type === "android_app";
}

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

  let banReason: string | null = null;
  if (
    user &&
    body.eventType === "external_capture_suspected" &&
    (await hasRecentPendingPayment(admin, user.id))
  ) {
    // Suppressed: a real, server-recorded Clip checkout this user started
    // within the last PAYMENT_GRACE_WINDOW_MINUTES fully explains the
    // blur-then-click pattern. Still logged above for audit visibility —
    // just not treated as ban-worthy this one time.
  } else if (
    user &&
    body.eventType === "external_capture_suspected" &&
    (await isAndroidApp(admin, user.id))
  ) {
    // Suppressed on Android app users (2026-08-29, see the comment on
    // AUTO_BAN_EVENT_TYPES above) — FLAG_SECURE already blocks the capture
    // itself, so this indirect heuristic has nothing left to add there
    // besides false positives. Still logged above for audit visibility.
  } else if (user && AUTO_BAN_EVENT_TYPES.has(body.eventType)) {
    banReason = body.eventType;
  } else if (user && body.eventType === "blur") {
    const recentBlurs = await countRecentBlurEvents(admin, user.id);
    if (recentBlurs >= BLUR_BAN_THRESHOLD) {
      banReason = "excessive_tab_switching";
    }
  }

  if (user && banReason) {
    await applyBan(admin, {
      userId: user.id,
      ip,
      fingerprint,
      reason: banReason,
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

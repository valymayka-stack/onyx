import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { hasRole, getUserRoles } from "@/lib/auth/roles";
import { getRequestIp } from "@/lib/security/requestIp";

const PUBLIC_PREFIXES = ["/login", "/api/"];
const MFA_PREFIXES = ["/mfa/enroll", "/mfa/verify"];

// No web-based signal (see ProtectedContentGuard.tsx) can prevent a
// screenshot on Android — the OS never lets a browser page see or block the
// gesture. The Android app (once built) sets FLAG_SECURE on its WebView,
// which the OS itself enforces at the pixel level, something no web page can
// ever do. Until then, a plain Android browser gets no content at all rather
// than content with a weaker guarantee than every other platform gets.
// ANDROID_APP_MARKER is a string the app's WebView appends to its own user
// agent (e.g. "... OnyxAndroidApp/1.0") so this check can tell the real app
// apart from a browser — spoofable by anyone deliberately faking the header,
// but that's true of every other client-reported signal in this app too, and
// spoofing it gains an attacker nothing they didn't already have (they could
// just photograph the screen instead).
const ANDROID_APP_MARKER = "OnyxAndroidApp";
const ANDROID_GATE_PATH = "/android-app-required";
const MOBILE_GATE_PATH = "/mobile-required";
const IPHONE_GATE_PATH = "/telegram-access";
const GATE_PATHS = [ANDROID_GATE_PATH, MOBILE_GATE_PATH, IPHONE_GATE_PATH];

function isUngatedAndroidBrowser(userAgent: string): boolean {
  return /Android/i.test(userAgent) && !userAgent.includes(ANDROID_APP_MARKER);
}

// iOS has no capture-prevention API for any web context (no FLAG_SECURE
// equivalent, not even for a native app) — so unlike Android, there's no app
// to build that would make Safari access safer than it already is. The
// business call (2026-08) is to route iPhone fans to Telegram instead
// (delivery already exists there, unrelated to this codebase) rather than
// serve them a weaker-guarantee version of the same content. iPad is not
// matched here — see isDesktopBrowser below for why it can't be told apart
// from a Mac, and why that's an accepted gap rather than something this
// check should try to paper over.
function isIphoneBrowser(userAgent: string): boolean {
  return /iPhone/i.test(userAgent);
}

// Leaks disproportionately come from people who can screen-record or
// screenshot with a keyboard shortcut and no OS-level friction — a desktop
// browser gives an attacker that for free, on top of drag-and-drop and
// devtools already being harder to fully block there. Blocking desktop
// outright forces every fan onto a platform where at least one of the two
// (Android app, iOS Safari's weaker but still-present JS deterrents) applies.
// Caveat: iPadOS Safari has reported itself as "Macintosh" in the UA string
// since iOS 13 (so desktop-tier sites render correctly) — there is no
// server-side signal that tells a real iPad apart from a real Mac, so a fan
// using an iPad gets blocked here too. Accepted trade-off for now.
function isDesktopBrowser(userAgent: string): boolean {
  return !/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
}

// Purely informational (see 0011_telegram_bridge_prep.sql) — reuses the same
// signals as the gate checks above rather than re-deriving them, so this
// can't silently drift from what actually gates a request.
type DeviceType = "android_app" | "android_browser" | "iphone" | "desktop" | "other_mobile";

function detectDeviceType(userAgent: string): DeviceType {
  if (/Android/i.test(userAgent)) {
    return userAgent.includes(ANDROID_APP_MARKER) ? "android_app" : "android_browser";
  }
  if (isIphoneBrowser(userAgent)) return "iphone";
  if (isDesktopBrowser(userAgent)) return "desktop";
  return "other_mobile";
}

function isPublicPath(path: string) {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

// A 403 JSON response, not a redirect — used for /api/ paths, which can't
// usefully follow a redirect to an HTML page. Carries over any cookies
// `response` already picked up from a Supabase session refresh, so an MFA
// rejection doesn't drop a token rotation that happened earlier in the
// same request.
function mfaRequiredJson(baseResponse: NextResponse) {
  const json = NextResponse.json({ error: "mfa_required" }, { status: 403 });
  baseResponse.cookies.getAll().forEach((cookie) => json.cookies.set(cookie));
  return json;
}

export async function middleware(request: NextRequest) {
  const { supabase, response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (!user) {
    if (isPublicPath(path)) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Banned accounts are signed out globally by applyBan() at the moment the
  // ban fires, but as a second layer, also block here in case a stale
  // cookie survives.
  const { data: profile } = await supabase
    .from("profiles")
    .select("banned_at, device_type, last_login_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.banned_at) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?banned=1", request.url));
  }

  const userAgent = request.headers.get("user-agent") ?? "";

  // Roles are needed below (login-history gating) before they're needed
  // again further down for the MFA check — computed once, reused for both.
  const roles = await getUserRoles(supabase, user.id);
  const isFan = roles.includes("fan");

  // Fire-and-forget: informational only (see 0011_telegram_bridge_prep.sql),
  // so nothing downstream should wait on it. Skipped for /admin and /studio
  // since this is about tracking fan platforms, not staff devices.
  if (!path.startsWith("/admin") && !path.startsWith("/studio")) {
    const detectedDevice = detectDeviceType(userAgent);
    if (profile && profile.device_type !== detectedDevice) {
      supabase
        .from("profiles")
        .update({ device_type: detectedDevice })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("Failed to record device_type", error);
        });
    }

    // Login history is fan-only (2026-08) — admin/creator IPs aren't
    // retained. Compared as Date values, not raw strings: Postgres may
    // reformat the timestamptz on round-trip, and a strict string compare
    // would then record a "new login" on every single request.
    const lastSignInAt = user.last_sign_in_at;
    const alreadyRecorded =
      !!lastSignInAt &&
      !!profile?.last_login_at &&
      new Date(profile.last_login_at).getTime() === new Date(lastSignInAt).getTime();

    if (isFan && lastSignInAt && !alreadyRecorded) {
      const ip = getRequestIp(request);
      supabase
        .from("login_history")
        .insert({ user_id: user.id, ip, user_agent: userAgent, device_type: detectedDevice })
        .then(({ error }) => {
          if (error) console.error("Failed to record login_history", error);
        });
      supabase
        .from("profiles")
        .update({ last_login_at: lastSignInAt })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("Failed to update last_login_at", error);
        });
    }
  }

  // Every authenticated page response is marked non-cacheable so the
  // browser's back-forward cache (bfcache) never resurrects a page after
  // the session dies (e.g. right after an auto-ban) — without this,
  // pressing back/forward can show the last-rendered snapshot instead of
  // re-checking with the server. iOS Safari in particular restores pages
  // from bfcache far more aggressively than desktop browsers, so this
  // matters most for a fan on their phone hitting back right after a ban.
  response.headers.set("Cache-Control", "no-store, must-revalidate");

  // Mandatory MFA is admin-only (2026-08) — fans and creators found
  // enrollment too much friction. Single-session enforcement lives inside
  // the MFA step-up itself (see MfaVerifyForm.tsx / MfaEnrollForm.tsx —
  // both call supabase.auth.signOut({scope:"others"}) right after a
  // successful challenge), so scoping MFA to admin-only scopes single-
  // session enforcement to admin-only too, as a direct consequence — no
  // separate mechanism needed for that.
  const requiresMfa = roles.includes("admin");

  if (requiresMfa) {
    // Figure out whether this session still needs to enroll a factor
    // (never enrolled) or step up an existing factor (aal1 -> aal2).
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aal && aal.currentLevel !== aal.nextLevel) {
      // A verified factor exists but this session hasn't completed the
      // challenge yet. Previously this whole check was skipped for /api/
      // paths — meaning a stolen password alone (aal1, no TOTP step-up)
      // could call any mutating API route directly. Now API paths get a
      // 403 instead of being waved through.
      if (path.startsWith("/mfa/verify")) {
        return response;
      }
      if (path.startsWith("/api/")) {
        return mfaRequiredJson(response);
      }
      return NextResponse.redirect(new URL("/mfa/verify", request.url));
    }

    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal1") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasVerifiedTotp = (factors?.totp ?? []).some(
        (f) => f.status === "verified",
      );
      if (!hasVerifiedTotp) {
        if (path.startsWith("/mfa/enroll")) {
          return response;
        }
        if (path.startsWith("/api/")) {
          return mfaRequiredJson(response);
        }
        return NextResponse.redirect(new URL("/mfa/enroll", request.url));
      }
    }
  } else if (MFA_PREFIXES.some((p) => path.startsWith(p))) {
    // A non-admin has nothing to do here (stale bookmark, or an account
    // that enrolled back when MFA was mandatory for everyone) — send them
    // where they'd normally land instead of showing an enroll/verify page
    // that no longer applies to them.
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  if (isPublicPath(path) || MFA_PREFIXES.some((p) => path.startsWith(p))) {
    return response;
  }

  // Admins and creators manage their own account/content from whatever
  // device they have on hand — these gates are aimed at fans viewing
  // delivered photos, not at the people running the platform.
  const isPlatformPath =
    GATE_PATHS.includes(path) || path.startsWith("/admin") || path.startsWith("/studio");

  if (!isPlatformPath && isUngatedAndroidBrowser(userAgent)) {
    return NextResponse.redirect(new URL(ANDROID_GATE_PATH, request.url));
  }

  if (!isPlatformPath && isIphoneBrowser(userAgent)) {
    return NextResponse.redirect(new URL(IPHONE_GATE_PATH, request.url));
  }

  if (!isPlatformPath && isDesktopBrowser(userAgent)) {
    return NextResponse.redirect(new URL(MOBILE_GATE_PATH, request.url));
  }

  if (path.startsWith("/admin") && !(await hasRole(supabase, user.id, "admin"))) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  if (path.startsWith("/studio") && !(await hasRole(supabase, user.id, "creator"))) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  return response;
}

export const config = {
  // /downloads/ is excluded alongside the static-asset extensions below —
  // the Android APK living there is a public installer binary with nothing
  // user-specific in it, so it doesn't need the auth/ban/MFA checks this
  // middleware runs before anything else. Sending a large file through
  // those checks anyway (several sequential Supabase calls before a byte of
  // the response goes out) was actually breaking the download outright —
  // 503s under Railway, even for an authenticated request — not just adding
  // needless latency.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|downloads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

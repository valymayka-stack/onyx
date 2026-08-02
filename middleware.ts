import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { hasRole } from "@/lib/auth/roles";

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

function isUngatedAndroidBrowser(userAgent: string): boolean {
  return /Android/i.test(userAgent) && !userAgent.includes(ANDROID_APP_MARKER);
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
    .select("banned_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.banned_at) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?banned=1", request.url));
  }

  // Every authenticated page response is marked non-cacheable so the
  // browser's back-forward cache (bfcache) never resurrects a page after
  // the session dies (e.g. right after an auto-ban) — without this,
  // pressing back/forward can show the last-rendered snapshot instead of
  // re-checking with the server. iOS Safari in particular restores pages
  // from bfcache far more aggressively than desktop browsers, so this
  // matters most for a fan on their phone hitting back right after a ban.
  response.headers.set("Cache-Control", "no-store, must-revalidate");

  // Mandatory MFA: figure out whether this session still needs to enroll a
  // factor (never enrolled) or step up an existing factor (aal1 -> aal2).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal && aal.currentLevel !== aal.nextLevel) {
    // A verified factor exists but this session hasn't completed the
    // challenge yet. Previously this whole check was skipped for /api/
    // paths — meaning a stolen password alone (aal1, no TOTP step-up) could
    // call any mutating API route directly. Now API paths get a 403
    // instead of being waved through.
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

  if (isPublicPath(path) || MFA_PREFIXES.some((p) => path.startsWith(p))) {
    return response;
  }

  // Admins and creators manage their own account/content from whatever
  // device they have on hand — this gate is aimed at fans viewing delivered
  // photos, not at the people running the platform.
  if (
    path !== ANDROID_GATE_PATH &&
    !path.startsWith("/admin") &&
    !path.startsWith("/studio") &&
    isUngatedAndroidBrowser(request.headers.get("user-agent") ?? "")
  ) {
    return NextResponse.redirect(new URL(ANDROID_GATE_PATH, request.url));
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

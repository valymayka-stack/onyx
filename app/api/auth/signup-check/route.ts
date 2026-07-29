import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIp } from "@/lib/security/requestIp";
import { countRecentAttempts, logAttempt } from "@/lib/security/rateLimiter";

const SIGNUP_CHECK_LIMIT_PER_MINUTE = 20;

// Gate checked BEFORE supabase.auth.signUp() is ever called (see
// components/SignupForm.tsx). Blocks account creation from a banned IP OR a
// banned device fingerprint — checking both is what raises the cost of
// evasion above simple IP rotation (a VPN/hotspot swap changes the IP but
// not the fingerprint, and vice versa).
export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const body = await request.json().catch(() => ({}));
  const fingerprint =
    typeof body?.fingerprint === "string" ? body.fingerprint : null;

  const supabase = createAdminClient();

  // No user_id exists yet at this point (pre-signup), so this is keyed by IP
  // only — same countRecentAttempts/logAttempt pattern already used for
  // content requests and security events, just the first time it's applied
  // to an unauthenticated route.
  const attemptCount = await countRecentAttempts(supabase, {
    ip,
    actionType: "signup_check",
    windowMinutes: 1,
  });
  if (attemptCount >= SIGNUP_CHECK_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  await logAttempt(supabase, { ip, actionType: "signup_check" });

  const { data: ipBan } = await supabase
    .from("ip_bans")
    .select("ip")
    .eq("ip", ip)
    .maybeSingle();

  if (ipBan) {
    return NextResponse.json(
      { error: "signup blocked: policy violation on record for this network" },
      { status: 403 },
    );
  }

  if (fingerprint) {
    const { data: fpBan } = await supabase
      .from("device_fingerprint_bans")
      .select("fingerprint")
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (fpBan) {
      return NextResponse.json(
        { error: "signup blocked: policy violation on record for this device" },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

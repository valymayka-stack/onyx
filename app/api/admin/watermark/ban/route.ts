import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";

// Banning off a watermark match is a manual, forensic decision (an admin
// reviewed an uploaded image and decided it's the same delivery) — not a
// live request, so there's no current IP/fingerprint to fold into the same
// cascade the honeypot/DevTools triggers use (lib/security/banCascade.ts).
// This only touches the account, same scope as the admin/users ban toggle.
export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetUserId = body?.userId;
  if (typeof targetUserId !== "string") {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  const admin = createAdminClient();

  await admin
    .from("profiles")
    .update({ banned_at: new Date().toISOString() })
    .eq("id", targetUserId);

  await admin.from("ban_history").insert({
    target_type: "user",
    target_value: targetUserId,
    action: "banned",
    reason: "watermark_match",
    actor_id: user.id,
  });

  await admin.auth.admin.signOut(targetUserId, "global");

  return NextResponse.json({ ok: true });
}

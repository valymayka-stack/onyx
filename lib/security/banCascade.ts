import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasRole } from "@/lib/auth/roles";

interface BanInput {
  userId: string;
  ip: string;
  fingerprint: string | null;
  reason: string;
}

// Shared ban cascade used by every auto-ban trigger — the client-reported
// signals in /api/security-events (DevTools, drag/copy/blur, automation,
// PrintScreen) and the server-side bulk-download check in
// /api/content/[itemId]: bans the account, the IP, and the device
// fingerprint in one pass, logs all three to ban_history, and kills the
// session immediately (not on next login).
//
// Admins are exempt, checked here rather than at each call site so no
// future trigger can forget it: an admin previewing a large collection in
// /admin (which renders photos through the same signed delivery route fans
// use) legitimately looks exactly like the bulk-download pattern this is
// meant to catch, and self-locking the one real admin account out mid-review
// is worse than the auto-ban ever protecting against — a compromised admin
// account is a manual-ban-button problem, not this heuristic's job.
export async function applyBan(
  admin: SupabaseClient,
  { userId, ip, fingerprint, reason }: BanInput,
): Promise<void> {
  if (await hasRole(admin, userId, "admin")) return;

  await admin
    .from("profiles")
    .update({ banned_at: new Date().toISOString() })
    .eq("id", userId);

  await admin.from("ip_bans").upsert({ ip, reason }, { onConflict: "ip" });

  if (fingerprint) {
    await admin
      .from("device_fingerprint_bans")
      .upsert({ fingerprint, reason }, { onConflict: "fingerprint" });
  }

  const banHistoryRows: {
    target_type: string;
    target_value: string;
    action: string;
    reason: string;
  }[] = [
    { target_type: "user", target_value: userId, action: "banned", reason },
    { target_type: "ip", target_value: ip, action: "banned", reason },
  ];
  if (fingerprint) {
    banHistoryRows.push({
      target_type: "fingerprint",
      target_value: fingerprint,
      action: "banned",
      reason,
    });
  }
  await admin.from("ban_history").insert(banHistoryRows);

  await admin.auth.admin.signOut(userId, "global");
}

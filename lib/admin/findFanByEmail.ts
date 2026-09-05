import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

// Was a full, unpaginated admin.auth.admin.listUsers() scan (capped at
// perPage 1000, so it could even silently miss real users past that page)
// on every single call — GoTrue's admin API has no "get user by email"
// helper in supabase-js, but auth.users.email already has a unique index,
// so a direct SQL lookup (find_auth_user_id_by_email, 0028_fast_auth_user_by_
// email.sql) is both correct at any scale and far faster. Root cause of the
// Telegram-bot Onyx-provisioning bridge's high failure rate under its
// caller's 10s timeout (2026-09-05) — this function is shared by 8 call
// sites (provisioning, password reset, ban, expiry, device-info, etc.), so
// fixing it here fixes all of them at once.
export async function findFanIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("find_auth_user_id_by_email", { p_email: email });
  if (error) return null;
  return data ?? null;
}

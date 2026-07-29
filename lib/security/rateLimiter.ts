import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

interface RateLimitQuery {
  userId?: string | null;
  ip?: string | null;
  actionType: string;
  windowMinutes?: number;
}

// Direct port of Taurina's count_recent_subscription_attempts pattern
// (db/queries.py): one row per attempt in an append-only table, counted via
// a time-window query. Reused here for every rate-limited action (signup,
// content requests, security-event posts) instead of a separate mechanism
// per action — no Redis needed at sandbox scale.
export async function countRecentAttempts(
  supabase: SupabaseClient,
  { userId, ip, actionType, windowMinutes = 10 }: RateLimitQuery,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  let query = supabase
    .from("action_attempts")
    .select("id", { count: "exact", head: true })
    .eq("action_type", actionType)
    .gte("created_at", since);

  query = userId ? query.eq("user_id", userId) : query.eq("ip", ip ?? "");

  const { count } = await query;
  return count ?? 0;
}

export async function logAttempt(
  supabase: SupabaseClient,
  { userId, ip, actionType }: Omit<RateLimitQuery, "windowMinutes">,
): Promise<void> {
  await supabase
    .from("action_attempts")
    .insert({ user_id: userId ?? null, ip: ip ?? null, action_type: actionType });
}

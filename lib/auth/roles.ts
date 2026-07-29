import type { SupabaseClient } from "@supabase/supabase-js";

export type Role = "admin" | "creator" | "fan";

// Role is intentionally read fresh from the DB on every check rather than
// cached in the JWT — if an admin revokes a role, a cached claim would stay
// valid until token refresh. For sandbox-scale traffic this extra query is
// cheap and correctness-by-construction beats a caching bug.
export async function getUserRoles(
  supabase: SupabaseClient,
  userId: string,
): Promise<Role[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  return (data ?? []).map((row) => row.role as Role);
}

export async function hasRole(
  supabase: SupabaseClient,
  userId: string,
  role: Role,
): Promise<boolean> {
  const roles = await getUserRoles(supabase, userId);
  return roles.includes(role);
}

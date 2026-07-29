import type { SupabaseClient } from "@supabase/supabase-js";

// Where to send a session right after login/MFA completes, based on role —
// avoids a creator landing on the fan feed and seeing a "subscribe to
// yourself" button, which is what happened when test accounts held more
// than one role.
export async function getPostLoginPath(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const roles = (data ?? []).map((r) => r.role as string);

  if (roles.includes("creator")) return "/studio";
  if (roles.includes("admin")) return "/admin";
  return "/feed";
}

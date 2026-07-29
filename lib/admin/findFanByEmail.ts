import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

// GoTrue's admin API has no direct "get user by email" call in supabase-js,
// so this pages through listUsers and matches client-side — fine at
// sandbox scale, would need real pagination past a few thousand users.
export async function findFanIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return null;
  const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared owner-or-admin gate for the studio collection-management routes
// (grants, cover). A creator manages only their own collections; an admin
// can manage any of them.
export async function authorizeCollectionOwner(collectionId: string) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return { error: "no session" as const, status: 401 as const };

  const admin = createAdminClient();
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");

  const { data: collection } = await admin
    .from("content_collections")
    .select("id, creator_id")
    .eq("id", collectionId)
    .maybeSingle();

  if (!collection) return { error: "not found" as const, status: 404 as const };
  if (!isAdmin && collection.creator_id !== user.id) {
    return { error: "forbidden" as const, status: 403 as const };
  }

  return { admin, user, collection };
}

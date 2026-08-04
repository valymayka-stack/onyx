import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export class DeleteAccountError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Hard delete for a fan account — distinct from the ban/suspend toggle.
// Fans don't own storage content, so there's nothing to clean up there;
// everything else (profile, fan row, role, grants) cascades via
// auth.users(id) on delete cascade, and audit/security/payment history is
// preserved anonymized rather than deleted alongside the account (see
// 0012_account_deletion_preserve_audit_trail.sql).
export async function deleteFanAccount(fanId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(fanId);
  if (error) {
    throw new DeleteAccountError(error.message, 500);
  }
}

// Hard delete for a creator account. Unlike a fan, a creator owns actual
// files in the content-raw storage bucket — the DB rows (content_items,
// content_collections, collection_access_grants) cascade away via
// creator_id/collection_id, but the underlying storage objects don't
// delete themselves, so those are removed explicitly first, while the rows
// that still hold their paths exist to read from.
export async function deleteCreatorAccount(creatorId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: collections } = await admin
    .from("content_collections")
    .select("id")
    .eq("creator_id", creatorId);
  const collectionIds = (collections ?? []).map((c) => c.id);

  if (collectionIds.length > 0) {
    const { data: items } = await admin
      .from("content_items")
      .select("storage_path")
      .in("collection_id", collectionIds);
    await removeStoragePaths((items ?? []).map((i) => i.storage_path));
  }

  // Creators also have content_items outside any collection (creator-wide
  // subscription-feed content, collection_id null) — clean those up too.
  const { data: standaloneItems } = await admin
    .from("content_items")
    .select("storage_path")
    .eq("creator_id", creatorId)
    .is("collection_id", null);
  await removeStoragePaths((standaloneItems ?? []).map((i) => i.storage_path));

  const { error } = await admin.auth.admin.deleteUser(creatorId);
  if (error) {
    throw new DeleteAccountError(error.message, 500);
  }
}

async function removeStoragePaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("content-raw").remove(paths);
  if (error) {
    throw new DeleteAccountError(
      `No se pudieron borrar los archivos de almacenamiento: ${error.message}`,
      500,
    );
  }
}

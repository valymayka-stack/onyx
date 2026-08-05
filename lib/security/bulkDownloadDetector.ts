import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Catches a fan-with-real-access using automation to grab every photo
// across their collections quickly, rather than viewing them live — the
// one leak vector none of the client-side signals in
// ProtectedContentGuard.tsx can see, since it never touches a browser tab
// at all. content_delivery_marks already has one row per successful
// delivery (item_id, user_id, created_at) for the invisible-watermark
// forensic trail, so this reuses it rather than adding a new table.
const WINDOW_MINUTES = 2;

// Deliberately generous: opening one busy collection legitimately fires a
// request per photo all at once (the thumbnail strip in
// CollectionPhotoViewer loads every photo, not just the current one), so
// this has to sit well above any single realistic collection's size. Only
// logs a security_event for admin review now (2026-08) — a fan legitimately
// assigned many collections crossed this same threshold in one normal
// session and got auto-banned, so it no longer bans on its own. Raised from
// 40 to 55 after a real collection (52 photos) sat close enough to 40 that
// a fan opening it in full would have been flagged. Not empirically tuned
// against real traffic — revisit if it proves too loose or too tight.
export const DISTINCT_ITEM_LOG_THRESHOLD = 55;

export async function countDistinctItemsRecent(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await supabase
    .from("content_delivery_marks")
    .select("item_id")
    .eq("user_id", userId)
    .gte("created_at", since);

  return new Set((data ?? []).map((row) => row.item_id as string)).size;
}

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
// this has to sit well above any single realistic collection's size to
// avoid banning someone for opening one big set. It's aimed at scripted
// harvesting across MULTIPLE collections in a short window instead. Raised
// from 40 to 55 after a real collection (52 photos) sat close enough to 40
// that a fan opening it in full would have been flagged — 55 leaves
// headroom above that. Still gated by WINDOW_MINUTES: 55 distinct photos
// inside 2 minutes is still fast, so scripted multi-collection harvesting
// is caught the same as before, just with more room for one big set. Not
// empirically tuned against real traffic — revisit if it proves too loose
// or too tight in practice.
export const DISTINCT_ITEM_BAN_THRESHOLD = 55;

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

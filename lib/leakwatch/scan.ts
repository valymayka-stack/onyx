import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Some bot-challenge pages (Cloudflare, etc.) return 200 with a JS
// challenge instead of a real block status — caught by content, not status.
const BOT_CHALLENGE_MARKERS = /just a moment|attention required|cf-browser-verification|checking your browser/i;

export interface ScanTargetResult {
  targetId: string;
  siteLabel: string;
  newFindings: number;
  blocked: boolean;
  blockedReason: string | null;
}

interface LeakWatchTarget {
  id: string;
  subject_name: string;
  url: string;
  site_label: string;
  link_pattern: string;
}

// Detection is automated; sending a takedown is not — see dmcaTemplate.ts and
// the admin review flow. This only ever writes pending_review findings.
export async function runScan(admin: SupabaseClient): Promise<ScanTargetResult[]> {
  const { data: targets } = await admin
    .from("leak_watch_targets")
    .select("id, subject_name, url, site_label, link_pattern")
    .eq("active", true);

  const results: ScanTargetResult[] = [];
  for (const target of (targets ?? []) as LeakWatchTarget[]) {
    results.push(await scanTarget(admin, target));
  }
  return results;
}

async function markBlocked(
  admin: SupabaseClient,
  target: LeakWatchTarget,
  reason: string,
): Promise<ScanTargetResult> {
  await admin
    .from("leak_watch_targets")
    .update({ blocked_reason: reason, last_checked_at: new Date().toISOString() })
    .eq("id", target.id);

  return {
    targetId: target.id,
    siteLabel: target.site_label,
    newFindings: 0,
    blocked: true,
    blockedReason: reason,
  };
}

async function scanTarget(
  admin: SupabaseClient,
  target: LeakWatchTarget,
): Promise<ScanTargetResult> {
  let html: string;

  try {
    const res = await fetch(target.url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return markBlocked(admin, target, `http_${res.status}`);
    }

    html = await res.text();
  } catch {
    return markBlocked(admin, target, "fetch_error");
  }

  if (BOT_CHALLENGE_MARKERS.test(html)) {
    return markBlocked(admin, target, "bot_challenge");
  }

  // link_pattern matches the item URL text directly (validated by hand
  // against each site's real HTML before being saved on the target — see
  // scripts/leak-scan.mjs for the seed values used).
  let pattern: RegExp;
  try {
    pattern = new RegExp(target.link_pattern, "g");
  } catch {
    return markBlocked(admin, target, "invalid_link_pattern");
  }

  const itemUrls = Array.from(new Set(html.match(pattern) ?? [])).sort();

  const { data: lastSnapshot } = await admin
    .from("leak_watch_snapshots")
    .select("item_urls")
    .eq("target_id", target.id)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousUrls = new Set<string>(
    ((lastSnapshot?.item_urls as string[] | null) ?? []),
  );
  const newUrls = itemUrls.filter((u) => !previousUrls.has(u));

  if (newUrls.length > 0) {
    await admin.from("leak_findings").upsert(
      newUrls.map((itemUrl) => ({
        target_id: target.id,
        subject_name: target.subject_name,
        item_url: itemUrl,
      })),
      { onConflict: "target_id,item_url", ignoreDuplicates: true },
    );
  }

  await admin.from("leak_watch_snapshots").insert({
    target_id: target.id,
    item_urls: itemUrls,
  });

  await admin
    .from("leak_watch_targets")
    .update({ blocked_reason: null, last_checked_at: new Date().toISOString() })
    .eq("id", target.id);

  return {
    targetId: target.id,
    siteLabel: target.site_label,
    newFindings: newUrls.length,
    blocked: false,
    blockedReason: null,
  };
}

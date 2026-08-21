import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const TELEGRAM_ID_FROM_EMAIL = /^(\d{4,15})@onyx\.com$/i;

// Every fan account's email is `<telegramId>@onyx.com` (see
// provisionFan.ts) — no separate column needed to recover the id.
export function telegramIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = TELEGRAM_ID_FROM_EMAIL.exec(email);
  return match ? match[1] : null;
}

// Shared by both ban paths (the auto-ban cascade and the manual "Suspender"
// button) — a fan's grants are the only record of which creator(s) they
// actually belong to, so this has to be looked up fresh each time rather
// than assumed. Empty array means "couldn't resolve" (no grants), which
// callers treat as "use the unscoped/Chivis bridge" to preserve the
// original behavior rather than notifying nobody.
export async function resolveCreatorHandlesForFan(
  admin: SupabaseClient,
  fanId: string,
): Promise<string[]> {
  const { data: grants } = await admin
    .from("collection_access_grants")
    .select("content_collections(creators(handle))")
    .eq("fan_id", fanId);
  const handles = new Set<string>();
  for (const grant of grants ?? []) {
    const collection = grant.content_collections as unknown as
      | { creators: { handle: string } | null }
      | null;
    const handle = collection?.creators?.handle;
    if (handle) handles.add(handle);
  }
  return Array.from(handles);
}

// TELEGRAM_BOT_BRIDGE_URL/_SECRET (unscoped) is Chivis's bridge — the first
// and, until 2026-08-21, the ONLY one wired. Every ban notification went
// there regardless of which creator the fan actually belonged to (confirmed
// bug: a Lore fan's suspension notified Chivis's admin chat, and Lore's bot
// never got told to kick them from Telegram at all — Lore had no /onyx/ban
// route to receive it either). Fixed by scoping per creator handle:
// TELEGRAM_BOT_BRIDGE_URL_<HANDLE>/_SECRET_<HANDLE> (e.g. `_LORE`). A creator
// with no scoped vars set gets no notification at all rather than silently
// falling back to another creator's bot — that fallback is exactly the bug
// this replaces. `null`/"chivis" keeps using the original unscoped vars, so
// Chivis's existing setup needs no Railway changes.
function bridgeConfig(creatorHandle: string | null): { baseUrl: string; secret: string } | null {
  if (creatorHandle && creatorHandle !== "chivis") {
    const suffix = creatorHandle.toUpperCase();
    const baseUrl = process.env[`TELEGRAM_BOT_BRIDGE_URL_${suffix}`];
    const secret = process.env[`TELEGRAM_BOT_BRIDGE_SECRET_${suffix}`];
    if (!baseUrl || !secret) return null;
    return { baseUrl, secret };
  }
  const baseUrl = process.env.TELEGRAM_BOT_BRIDGE_URL;
  const secret = process.env.TELEGRAM_BOT_BRIDGE_SECRET;
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

// Fire-and-forget: called from applyBan(), which must never fail or block
// on this. Reuses telegramId, not userId — the bot has no concept of Onyx's
// internal ids. creatorHandle comes from the fan's collection_access_grants
// at ban time (see banCascade.ts) — null means it couldn't be resolved
// (fan has no grants), which falls back to the unscoped/Chivis bridge same
// as always rather than notifying nobody.
export function notifyBotOfBan(telegramId: string, reason: string, creatorHandle: string | null): void {
  const config = bridgeConfig(creatorHandle);
  if (!config) return;

  fetch(`${config.baseUrl}/onyx/ban`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-onyx-bridge-secret": config.secret },
    body: JSON.stringify({ telegramId, reason }),
  }).catch((err) => {
    console.error("Failed to notify bot of ban", err);
  });
}

// Awaited from middleware.ts's device-switch enforcement — a fan moving
// from iPhone to the Android app must actually be kicked out of Telegram
// before delivery_channel flips to "app", or they'd briefly hold both.
// Still never throws: a failed revoke shouldn't block the request, since
// the fan's Onyx-side access is what actually gates viewing from here on.
// creatorHandle: same routing as notifyBotOfBan — confirmed bug (2026-08-21)
// where a Lore fan's iPhone gate page called this unscoped, hit Chivis's
// bridge, and told the fan "invite sent" when nothing was ever sent for
// their actual (Lore) channel. Callers must resolve the fan's creator(s)
// via resolveCreatorHandlesForFan and call once per creator/code group.
export async function revokeTelegramAccess(
  telegramId: string,
  channelCodes: string[],
  creatorHandle: string | null,
): Promise<boolean> {
  const config = bridgeConfig(creatorHandle);
  if (!config || channelCodes.length === 0) return false;

  try {
    const response = await fetch(`${config.baseUrl}/onyx/revoke-telegram-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-onyx-bridge-secret": config.secret },
      body: JSON.stringify({ telegramId, channelCodes }),
    });
    return response.ok;
  } catch (err) {
    console.error("Failed to revoke Telegram access", err);
    return false;
  }
}

// Awaited (unlike notifyBotOfBan) since the iPhone gate page's copy depends
// on whether this actually worked — but still never throws; a network
// error or an unconfigured bridge both just mean "couldn't request it",
// which the page falls back to a generic holding message for. Same
// creatorHandle routing requirement as revokeTelegramAccess above — this is
// the one that was actually confirmed broken for a real Lore fan.
export async function requestTelegramInvites(
  telegramId: string,
  channelCodes: string[],
  creatorHandle: string | null,
): Promise<boolean> {
  const config = bridgeConfig(creatorHandle);
  if (!config || channelCodes.length === 0) return false;

  try {
    const response = await fetch(`${config.baseUrl}/onyx/request-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-onyx-bridge-secret": config.secret },
      body: JSON.stringify({ telegramId, channelCodes }),
    });
    return response.ok;
  } catch (err) {
    console.error("Failed to request Telegram invites", err);
    return false;
  }
}

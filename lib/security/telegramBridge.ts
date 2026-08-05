import "server-only";

const TELEGRAM_ID_FROM_EMAIL = /^(\d{4,15})@onyx\.com$/i;

// Every fan account's email is `<telegramId>@onyx.com` (see
// provisionFan.ts) — no separate column needed to recover the id.
export function telegramIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = TELEGRAM_ID_FROM_EMAIL.exec(email);
  return match ? match[1] : null;
}

// Both env vars stay unset until the bot side of this bridge exists (not
// built as of 2026-08) — every function below silently no-ops in that case
// rather than throwing, since neither banning an account nor rendering the
// iPhone gate page should ever depend on an external system responding.
function bridgeConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.TELEGRAM_BOT_BRIDGE_URL;
  const secret = process.env.TELEGRAM_BOT_BRIDGE_SECRET;
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

// Fire-and-forget: called from applyBan(), which must never fail or block
// on this. Reuses telegramId, not userId — the bot has no concept of Onyx's
// internal ids.
export function notifyBotOfBan(telegramId: string, reason: string): void {
  const config = bridgeConfig();
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
export async function revokeTelegramAccess(
  telegramId: string,
  channelCodes: string[],
): Promise<boolean> {
  const config = bridgeConfig();
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
// which the page falls back to a generic holding message for.
export async function requestTelegramInvites(
  telegramId: string,
  channelCodes: string[],
): Promise<boolean> {
  const config = bridgeConfig();
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

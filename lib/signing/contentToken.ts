import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Long enough to browse a full carousel/lightbox at a normal pace without
// re-fetching (the token is only checked once, when the browser first
// requests the image bytes — after that the <img> already has them cached),
// short enough that a shared link stops working well before anyone would
// bother replaying it.
const TOKEN_TTL_SECONDS = 600;

interface TokenPayload {
  itemId: string;
  userId: string;
  expiresAt: number;
}

function sign(payload: string): string {
  return createHmac("sha256", process.env.CONTENT_TOKEN_SECRET!)
    .update(payload)
    .digest("hex");
}

// Short-TTL signed token embedded in the image request URL. This is a
// separate, app-level gate on top of Storage/RLS — even if a URL leaks or is
// shared, it stops working within TOKEN_TTL_SECONDS regardless of session
// state, and it's the identity that gets baked into the watermark itself.
export function issueContentToken(itemId: string, userId: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  const payload = `${itemId}.${userId}.${expiresAt}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyContentToken(
  token: string,
): TokenPayload | { error: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { error: "malformed token" };
  }

  const parts = decoded.split(".");
  if (parts.length !== 4) return { error: "malformed token" };

  const [itemId, userId, expiresAtRaw, signature] = parts;
  const payload = `${itemId}.${userId}.${expiresAtRaw}`;
  const expected = sign(payload);

  const sigBuf = Buffer.from(signature!);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return { error: "invalid signature" };
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { error: "token expired" };
  }

  return { itemId: itemId!, userId: userId!, expiresAt };
}

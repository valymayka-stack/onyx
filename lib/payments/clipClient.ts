// Onyx's own Clip Checkout Transparente client — a dedicated merchant
// account, separate from Taurina's/Lore's/Valentina's own Clip integrations
// (different API_KEY/SECRET, different Railway service, different Clip
// business account entirely). Mirrors Taurina's proven, working pattern
// (bot/clip_client.py) rather than Clip's untested embedded-checkout SDK:
// redirect the fan to Clip's hosted page, then re-verify via an authenticated
// GET before granting anything — Clip does not sign its webhook POSTs.
const CLIP_API_BASE = "https://api.payclip.com";

class ClipError extends Error {}

function authHeader(): string {
  const key = process.env.CLIP_API_KEY_ONYX;
  const secret = process.env.CLIP_API_SECRET_ONYX;
  if (!key || !secret) {
    throw new ClipError("CLIP_API_KEY_ONYX/CLIP_API_SECRET_ONYX not configured");
  }
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

export type ClipCheckout = {
  paymentRequestId: string;
  checkoutUrl: string;
};

export async function createCheckout(input: {
  amountCents: number;
  description: string;
}): Promise<ClipCheckout> {
  const amount = input.amountCents / 100;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!publicBaseUrl) throw new ClipError("PUBLIC_BASE_URL not configured");

  const successUrl = `${publicBaseUrl}/pago/gracias`;
  const response = await fetch(`${CLIP_API_BASE}/v2/checkout`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100) / 100,
      currency: "MXN",
      purchase_description: input.description.slice(0, 250),
      redirection_url: {
        success: successUrl,
        error: successUrl,
        default: successUrl,
      },
    }),
  });

  if (!response.ok) {
    throw new ClipError(`Clip create checkout failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    payment_request_id: string;
    payment_request_url: string;
  };

  return {
    paymentRequestId: data.payment_request_id,
    checkoutUrl: data.payment_request_url,
  };
}

export type ClipCheckoutStatus =
  | "CHECKOUT_COMPLETED"
  | "CHECKOUT_CANCELLED"
  | "CHECKOUT_EXPIRED"
  | string;

export async function getCheckoutStatus(paymentRequestId: string): Promise<ClipCheckoutStatus> {
  const response = await fetch(`${CLIP_API_BASE}/v2/checkout/${paymentRequestId}`, {
    headers: { Authorization: authHeader() },
  });

  if (!response.ok) {
    throw new ClipError(`Clip get checkout status failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { status: string };
  return data.status;
}

import "server-only";
import crypto from "crypto";

export interface ChargeResult {
  approved: boolean;
  reference: string;
  raw: unknown;
}

export interface ChargeInput {
  amountCents: number;
  fanId: string;
  creatorId: string;
}

// Single swap point for a real processor later: replace fakeCharge's body
// with a real API call that returns the same ChargeResult shape (plus add a
// webhook route for async approval instead of resolving inline) — no schema
// change needed, since payments.processor/processor_reference/raw_payload
// already fit a real gateway's fields.
export async function charge(input: ChargeInput): Promise<ChargeResult> {
  if (process.env.PAYMENT_PROCESSOR === "fake") return fakeCharge(input);
  throw new Error("No real payment processor configured yet");
}

async function fakeCharge(input: ChargeInput): Promise<ChargeResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return {
    approved: true,
    reference: `fake_${crypto.randomUUID()}`,
    raw: { simulated: true, ...input },
  };
}

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";

const CLIP_COMMISSION_RATE = 0.0445;

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Two ways in, same pattern as leak-watch/scan and data-retention: an
// authenticated admin manually running it, or an external scheduler (no
// in-app cron exists in this codebase — see plan) hitting this on a timer
// with a shared secret.
function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.REVENUE_SNAPSHOT_CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  return !!secret && !!provided && secretsMatch(provided, secret);
}

// Rolls up YESTERDAY's approved Clip payments/collection_purchases into
// daily_revenue_snapshots — one row per creator × kind. Idempotent: re-running
// for a day already snapshotted overwrites that day's row rather than
// double-counting (upsert on the (snapshot_date, creator_id, kind) unique key).
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const admin = createAdminClient();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const snapshotDate = startOfYesterday.toISOString().slice(0, 10);

  const [{ data: grupoPayments }, { data: coleccionPurchases }] = await Promise.all([
    admin
      .from("payments")
      .select("creator_id, amount_cents")
      .eq("status", "approved")
      .eq("processor", "clip")
      .gte("resolved_at", startOfYesterday.toISOString())
      .lt("resolved_at", startOfToday.toISOString()),
    admin
      .from("collection_purchases")
      .select("creator_id, amount_cents")
      .eq("status", "approved")
      .eq("processor", "clip")
      .gte("resolved_at", startOfYesterday.toISOString())
      .lt("resolved_at", startOfToday.toISOString()),
  ]);

  type Agg = { grossCents: number; count: number };
  const aggregate = new Map<string, Agg>();
  function add(creatorId: string, kind: "grupo" | "coleccion", amountCents: number) {
    const key = `${creatorId}:${kind}`;
    const existing = aggregate.get(key) ?? { grossCents: 0, count: 0 };
    existing.grossCents += amountCents;
    existing.count += 1;
    aggregate.set(key, existing);
  }
  for (const p of grupoPayments ?? []) add(p.creator_id, "grupo", p.amount_cents);
  for (const p of coleccionPurchases ?? []) add(p.creator_id, "coleccion", p.amount_cents);

  const rows = Array.from(aggregate.entries()).map(([key, agg]) => {
    const [creatorId, kind] = key.split(":");
    const commissionCents = Math.round(agg.grossCents * CLIP_COMMISSION_RATE);
    return {
      snapshot_date: snapshotDate,
      creator_id: creatorId,
      kind,
      gross_cents: agg.grossCents,
      commission_cents: commissionCents,
      net_cents: agg.grossCents - commissionCents,
      transaction_count: agg.count,
    };
  });

  if (rows.length > 0) {
    await admin
      .from("daily_revenue_snapshots")
      .upsert(rows, { onConflict: "snapshot_date,creator_id,kind" });
  }

  return NextResponse.json({ ok: true, snapshotDate, rows: rows.length });
}

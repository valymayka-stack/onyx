import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import { Card, CardContent } from "@/components/ui/card";

// Cross-creator/cross-table aggregation needs the service-role client, so —
// same as admin/users and admin/creators — this page does its own explicit
// hasRole check rather than relying on middleware alone.
export const dynamic = "force-dynamic";

// Internal-only revenue report for the in-app unlock feature (Clip, Onyx's
// own dedicated merchant account). Deliberately no email, no Telegram
// notification of any kind — this page is the only place this data
// surfaces, checked manually by the operator.
const CLIP_COMMISSION_RATE = 0.0445;

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

type Row = { creatorId: string; handle: string; kind: "grupo" | "coleccion"; grossCents: number; count: number };

export default async function AdminRevenuePage() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    redirect("/feed");
  }

  const admin = createAdminClient();
  const todaySince = startOfTodayIso();

  const [{ data: creators }, { data: todayGrupoPayments }, { data: todayColeccionPayments }, { data: snapshots }] =
    await Promise.all([
      admin.from("creators").select("id, handle"),
      admin
        .from("payments")
        .select("creator_id, amount_cents")
        .eq("status", "approved")
        .eq("processor", "clip")
        .gte("resolved_at", todaySince),
      admin
        .from("collection_purchases")
        .select("creator_id, amount_cents")
        .eq("status", "approved")
        .eq("processor", "clip")
        .gte("resolved_at", todaySince),
      admin
        .from("daily_revenue_snapshots")
        .select("creator_id, kind, gross_cents, transaction_count"),
    ]);

  const handleByCreator = new Map((creators ?? []).map((c) => [c.id, c.handle]));

  const todayRows = new Map<string, Row>();
  function addToday(creatorId: string, kind: "grupo" | "coleccion", amountCents: number) {
    const key = `${creatorId}:${kind}`;
    const existing = todayRows.get(key);
    if (existing) {
      existing.grossCents += amountCents;
      existing.count += 1;
    } else {
      todayRows.set(key, {
        creatorId,
        handle: handleByCreator.get(creatorId) ?? creatorId,
        kind,
        grossCents: amountCents,
        count: 1,
      });
    }
  }
  for (const p of todayGrupoPayments ?? []) addToday(p.creator_id, "grupo", p.amount_cents);
  for (const p of todayColeccionPayments ?? []) addToday(p.creator_id, "coleccion", p.amount_cents);

  const totalRows = new Map<string, Row>();
  for (const [key, row] of todayRows) {
    totalRows.set(key, { ...row });
  }
  for (const s of snapshots ?? []) {
    const key = `${s.creator_id}:${s.kind}`;
    const existing = totalRows.get(key);
    if (existing) {
      existing.grossCents += s.gross_cents;
      existing.count += s.transaction_count;
    } else {
      totalRows.set(key, {
        creatorId: s.creator_id,
        handle: handleByCreator.get(s.creator_id) ?? s.creator_id,
        kind: s.kind,
        grossCents: s.gross_cents,
        count: s.transaction_count,
      });
    }
  }

  function net(grossCents: number): number {
    return Math.round(grossCents * (1 - CLIP_COMMISSION_RATE));
  }
  function fmt(cents: number): string {
    return `$${(cents / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
  }

  const todayList = Array.from(todayRows.values()).sort((a, b) => a.handle.localeCompare(b.handle));
  const totalList = Array.from(totalRows.values()).sort((a, b) => a.handle.localeCompare(b.handle));
  const todayNetTotal = todayList.reduce((sum, r) => sum + net(r.grossCents), 0);
  const totalNetTotal = totalList.reduce((sum, r) => sum + net(r.grossCents), 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Ingresos" subtitle="Desbloqueos en la app (Clip), neto de comisión — solo aquí, sin correo ni Telegram" />
      <AdminNav />

      <Card>
        <CardContent className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Hoy</h2>
          {todayList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas todavía hoy.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {todayList.map((r) => (
                <div key={`${r.creatorId}:${r.kind}`} className="flex justify-between text-sm">
                  <span>
                    @{r.handle} · {r.kind === "grupo" ? "Grupo" : "Colecciones"} ({r.count})
                  </span>
                  <span>{fmt(net(r.grossCents))}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-border/60 pt-1 text-sm font-medium">
                <span>Total hoy</span>
                <span>{fmt(todayNetTotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Acumulado</h2>
          {totalList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {totalList.map((r) => (
                <div key={`${r.creatorId}:${r.kind}`} className="flex justify-between text-sm">
                  <span>
                    @{r.handle} · {r.kind === "grupo" ? "Grupo" : "Colecciones"} ({r.count})
                  </span>
                  <span>{fmt(net(r.grossCents))}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-border/60 pt-1 text-sm font-medium">
                <span>Total acumulado</span>
                <span>{fmt(totalNetTotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

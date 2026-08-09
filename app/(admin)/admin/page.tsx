import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const since24h = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [
    creators,
    fans,
    activeSubs,
    premiumContent,
    publicContent,
    pendingLeaks,
    banned,
    recentEvents,
    approvedPayments,
    approvedCollectionPurchases,
    registeredUsers,
    androidUsers,
    iphoneUsers,
  ] = await Promise.all([
    supabase.from("creators").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("fans").select("*", { count: "exact", head: true }),
    supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .gt("ends_at", now),
    supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("is_premium", true),
    supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("is_premium", false),
    supabase
      .from("leak_findings")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .not("banned_at", "is", null),
    supabase
      .from("security_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since24h),
    supabase.from("payments").select("amount_cents").eq("status", "approved"),
    supabase.from("collection_purchases").select("amount_cents").eq("status", "approved"),
    // device_type is only ever written for fans (middleware skips /admin and
    // /studio when updating it), so these three naturally reflect fan
    // accounts without needing a role join.
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .in("device_type", ["android_app", "android_browser"]),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("device_type", "iphone"),
  ]);

  const totalRevenueCents =
    (approvedPayments.data ?? []).reduce((sum, p) => sum + (p.amount_cents ?? 0), 0) +
    (approvedCollectionPurchases.data ?? []).reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

  const cards: { label: string; value: string; href: string }[] = [
    { label: "Creadoras activas", value: String(creators.count ?? 0), href: "/admin/content" },
    { label: "Fans", value: String(fans.count ?? 0), href: "/admin/users" },
    {
      label: "Suscripciones activas",
      value: String(activeSubs.count ?? 0),
      href: "/admin/users",
    },
    {
      label: "Ingresos aprobados",
      value: `$${(totalRevenueCents / 100).toFixed(2)}`,
      href: "/admin/users",
    },
    {
      label: "Contenido (premium / público)",
      value: `${premiumContent.count ?? 0} / ${publicContent.count ?? 0}`,
      href: "/admin/content",
    },
    {
      label: "Fugas pendientes de revisión",
      value: String(pendingLeaks.count ?? 0),
      href: "/admin/leaks",
    },
    { label: "Cuentas suspendidas", value: String(banned.count ?? 0), href: "/admin/users" },
    {
      label: "Eventos de seguridad (24h)",
      value: String(recentEvents.count ?? 0),
      href: "/admin/security",
    },
    {
      label: "Usuarios registrados",
      value: String(registeredUsers.count ?? 0),
      href: "/admin/users",
    },
    { label: "Usuarios Android", value: String(androidUsers.count ?? 0), href: "/admin/users" },
    { label: "Usuarios iPhone", value: String(iphoneUsers.count ?? 0), href: "/admin/users" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Admin" subtitle="Resumen general del sandbox" />
      <AdminNav />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{card.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}

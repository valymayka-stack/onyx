import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import BanToggleButton from "@/components/admin/BanToggleButton";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import ResetDeviceSwitchButton from "@/components/admin/ResetDeviceSwitchButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Drill-down counterpart to /admin/users — that page can only show every
// account at once; this answers "what does *this* fan actually have
// access to" without clicking into every collection one at a time.
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const sessionClient = await createClient();
  const {
    data: { user: sessionUser },
  } = await sessionClient.auth.getUser();
  if (!sessionUser || !(await hasRole(sessionClient, sessionUser.id, "admin"))) {
    redirect("/feed");
  }

  const admin = createAdminClient();

  const [{ data: userData }, { data: profile }, { data: roleRows }, { data: grantRows }] =
    await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin
        .from("profiles")
        .select("display_name, banned_at, device_type, last_login_at, delivery_channel, device_switch_used_at")
        .eq("id", userId)
        .maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin
        .from("collection_access_grants")
        .select("collection_id, created_at, content_collections(id, title, telegram_channel_code, creators(handle))")
        .eq("fan_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  if (!userData?.user) notFound();

  const roles = (roleRows ?? []).map((r) => r.role);
  const isFan = roles.includes("fan");

  // login_history is only ever written for fans (see middleware.ts) — no
  // point querying it for admin/creator accounts.
  const { data: loginRows } = isFan
    ? await admin
        .from("login_history")
        .select("ip, user_agent, device_type, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: null };

  // Reported by the bot right after it tries to DM Onyx credentials/access
  // (see app/api/bot/credential-delivery/route.ts) — the only way to tell
  // "never logged in because the DM never arrived" apart from "never logged
  // in despite having it," which otherwise look identical here.
  const { data: deliveryRows } = isFan
    ? await admin
        .from("credential_deliveries")
        .select("channel_code, status, created_at")
        .eq("fan_id", userId)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: null };

  // Fan accounts are provisioned as "{telegramId}@onyx.com" (see
  // provisionFan.ts) — the Telegram ID is just the email's local part.
  const telegramId =
    isFan && userData.user.email ? userData.user.email.split("@")[0] : null;

  const grants = (grantRows ?? []).map((g) => {
    const collection = (
      g.content_collections as unknown as
        | { id: string; title: string; telegram_channel_code: string | null; creators: { handle: string }[] | { handle: string } | null }[]
        | { id: string; title: string; telegram_channel_code: string | null; creators: { handle: string }[] | { handle: string } | null }
        | null
    ) instanceof Array
      ? (g.content_collections as unknown as { id: string; title: string; telegram_channel_code: string | null; creators: { handle: string }[] | { handle: string } | null }[])[0]
      : (g.content_collections as unknown as { id: string; title: string; telegram_channel_code: string | null; creators: { handle: string }[] | { handle: string } | null } | null);

    const creator = (collection?.creators as unknown as { handle: string }[] | { handle: string } | null)
      instanceof Array
      ? (collection?.creators as unknown as { handle: string }[])[0]
      : (collection?.creators as unknown as { handle: string } | null);

    return {
      grantedAt: g.created_at,
      collectionId: collection?.id ?? g.collection_id,
      title: collection?.title ?? "(colección eliminada)",
      telegramChannelCode: collection?.telegram_channel_code ?? null,
      creatorHandle: creator?.handle ?? "—",
    };
  });

  // Only fans with at least one telegram-bridged collection are subject to
  // the device-switch lock (0014_delivery_channel_lock.sql) — nothing to
  // show or reset otherwise.
  const hasBridgedGrant = grants.some((g) => g.telegramChannelCode);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader
        title={profile?.display_name || userData.user.email || "Usuario"}
        subtitle={userData.user.email ?? undefined}
      />
      <AdminNav />

      <Link
        href="/admin/users"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        Volver a usuarios
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuenta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {roles.map((role) => (
              <Badge key={role} variant="outline">
                {role}
              </Badge>
            ))}
            {profile?.banned_at ? (
              <Badge variant="destructive">suspendida</Badge>
            ) : (
              <Badge variant="secondary">activa</Badge>
            )}
            {profile?.device_type && <Badge variant="outline">{profile.device_type}</Badge>}
          </div>
          <p className="text-muted-foreground">
            Creada el {formatDate(userData.user.created_at)}
          </p>
          {telegramId && (
            <p className="text-muted-foreground">
              Telegram ID: <span className="font-mono text-foreground">{telegramId}</span>
            </p>
          )}
          {profile?.last_login_at && (
            <p className="text-muted-foreground">
              Último inicio de sesión: {formatDateTime(profile.last_login_at)}
            </p>
          )}
          {hasBridgedGrant && (
            <p className="text-muted-foreground">
              Canal de entrega actual:{" "}
              <Badge variant="outline">{profile?.delivery_channel ?? "sin determinar"}</Badge>
              {profile?.device_switch_used_at && (
                <span className="ml-2">
                  Cambio de dispositivo usado el {formatDateTime(profile.device_switch_used_at)} — bloqueado hasta que lo autorices.
                </span>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <BanToggleButton userId={userId} banned={!!profile?.banned_at} />
            {hasBridgedGrant && profile?.device_switch_used_at && (
              <ResetDeviceSwitchButton userId={userId} />
            )}
            {!roles.includes("admin") && (
              <DeleteAccountButton
                endpoint="/api/admin/delete-fan"
                bodyKey="fanId"
                id={userId}
                confirmText={userData.user.email ?? userId}
                redirectTo="/admin/users"
                warningDetail="Esto elimina la cuenta y su acceso a todas las colecciones. El historial de seguridad se conserva de forma anónima."
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colecciones asignadas ({grants.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {grants.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este usuario no tiene ninguna colección asignada.
            </p>
          )}
          {grants.map((g) => (
            <Link
              key={g.collectionId}
              href={`/admin/collections/${g.collectionId}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-accent/50"
            >
              <div className="flex flex-col">
                <span className="font-medium">{g.title}</span>
                <span className="text-xs text-muted-foreground">
                  @{g.creatorHandle} · otorgada el {formatDate(g.grantedAt)}
                </span>
              </div>
              {g.telegramChannelCode ? (
                <Badge variant="outline">{g.telegramChannelCode}</Badge>
              ) : (
                <Badge variant="outline">sin canal Telegram</Badge>
              )}
            </Link>
          ))}
        </CardContent>
      </Card>

      {isFan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entregas de credenciales por Telegram</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(!deliveryRows || deliveryRows.length === 0) && (
              <p className="text-sm text-muted-foreground">
                El bot no ha reportado ningún envío de credenciales para esta cuenta.
              </p>
            )}
            {deliveryRows?.map((row, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <span>{formatDateTime(row.created_at)}</span>
                {row.channel_code && <Badge variant="outline">{row.channel_code}</Badge>}
                <Badge variant={row.status === "blocked" ? "destructive" : "secondary"}>
                  {row.status === "blocked" ? "bloqueado por el usuario" : "entregado"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isFan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de inicios de sesión</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(!loginRows || loginRows.length === 0) && (
              <p className="text-sm text-muted-foreground">
                Todavía no hay ningún inicio de sesión registrado.
              </p>
            )}
            {loginRows?.map((row, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <span>{formatDateTime(row.created_at)}</span>
                <span className="font-mono text-xs text-muted-foreground">{row.ip ?? "—"}</span>
                {row.device_type && <Badge variant="outline">{row.device_type}</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { formatDate } from "@/lib/formatDate";

// This page's data comes entirely from the service-role client (no
// cookies()/headers() call), so Next.js would otherwise treat it as
// statically generatable and cache the user list at build time. It must be
// fresh on every request — this is a live admin view, not a set of built
// pages that never see this route re-executed after deploy.
export const dynamic = "force-dynamic";

import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import BanToggleButton from "@/components/admin/BanToggleButton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function AdminUsersPage() {
  // This page's data comes from the service-role client, which bypasses RLS
  // entirely — every other admin page reads through the RLS-scoped session
  // client instead, so middleware being the *only* gate here (unlike
  // everywhere else) was a real gap, not just a style inconsistency.
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    redirect("/feed");
  }

  const admin = createAdminClient();

  const [{ data: userList }, { data: roles }, { data: profiles }, { data: activeSubs }] =
    await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from("user_roles").select("user_id, role"),
      admin.from("profiles").select("id, display_name, banned_at"),
      admin
        .from("subscriptions")
        .select("fan_id")
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString()),
    ]);

  const rolesByUser = new Map<string, string[]>();
  for (const r of roles ?? []) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));
  const fansWithActiveSub = new Set((activeSubs ?? []).map((s) => s.fan_id));

  const rows = (userList?.users ?? [])
    .map((u) => ({
      id: u.id,
      email: u.email ?? "—",
      createdAt: u.created_at,
      roles: rolesByUser.get(u.id) ?? [],
      displayName: profileByUser.get(u.id)?.display_name ?? "—",
      bannedAt: profileByUser.get(u.id)?.banned_at ?? null,
      hasActiveSub: fansWithActiveSub.has(u.id),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Usuarios" subtitle={`${rows.length} cuenta(s) registradas`} />
      <AdminNav />

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Suscripción</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-48 truncate">{row.email}</TableCell>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell>
                    {row.roles.map((role) => (
                      <Badge key={role} variant="outline" className="mr-1">
                        {role}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    {row.bannedAt ? (
                      <Badge variant="destructive">suspendida</Badge>
                    ) : (
                      <Badge variant="secondary">activa</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.roles.includes("fan") ? (
                      row.hasActiveSub ? (
                        <Badge variant="default">suscrito</Badge>
                      ) : (
                        <Badge variant="outline">sin suscripción</Badge>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <BanToggleButton userId={row.id} banned={!!row.bannedAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

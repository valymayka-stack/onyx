import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";

// This page's data comes entirely from the service-role client (no
// cookies()/headers() call), so Next.js would otherwise treat it as
// statically generatable and cache the user list at build time. It must be
// fresh on every request — this is a live admin view, not a set of built
// pages that never see this route re-executed after deploy.
export const dynamic = "force-dynamic";

import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import UsersTable from "@/components/admin/UsersTable";
import { Card, CardContent } from "@/components/ui/card";

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

  // listUsers only ever returns one page — with 1,000+ real accounts now,
  // perPage:1000 alone silently dropped everyone past the first page (found
  // 2026-09-05 chasing a fan who paid and had real access but didn't show up
  // here or in any bot lookup that used the same pattern). Loop until a page
  // comes back short of a full page instead of assuming everyone fits in one.
  async function listAllUsers() {
    const users: User[] = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error || !data) break;
      users.push(...data.users);
      if (data.users.length < perPage) break;
      page += 1;
    }
    return users;
  }

  const [userList, { data: roles }, { data: profiles }, { data: activeSubs }, { data: creators }, { data: grants }] =
    await Promise.all([
      listAllUsers(),
      admin.from("user_roles").select("user_id, role"),
      admin.from("profiles").select("id, display_name, banned_at"),
      admin
        .from("subscriptions")
        .select("fan_id")
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString()),
      admin.from("creators").select("id, handle").order("handle", { ascending: true }),
      // Which creator(s) each fan has a collection grant under — the only
      // way to tell "this is a Chivis fan" from "this is a Carman fan"
      // apart, since fans themselves carry no creator column of their own.
      admin
        .from("collection_access_grants")
        .select("fan_id, content_collections(creator_id)"),
    ]);

  const rolesByUser = new Map<string, string[]>();
  for (const r of roles ?? []) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));
  const fansWithActiveSub = new Set((activeSubs ?? []).map((s) => s.fan_id));

  const creatorIdsByFan = new Map<string, Set<string>>();
  for (const g of grants ?? []) {
    const collection = g.content_collections as unknown as
      | { creator_id: string }[]
      | { creator_id: string }
      | null;
    const creatorId = (collection instanceof Array ? collection[0] : collection)?.creator_id;
    if (!creatorId) continue;
    const set = creatorIdsByFan.get(g.fan_id) ?? new Set<string>();
    set.add(creatorId);
    creatorIdsByFan.set(g.fan_id, set);
  }

  const rows = userList
    .map((u) => ({
      id: u.id,
      email: u.email ?? "—",
      createdAt: u.created_at,
      roles: rolesByUser.get(u.id) ?? [],
      displayName: profileByUser.get(u.id)?.display_name ?? "—",
      bannedAt: profileByUser.get(u.id)?.banned_at ?? null,
      hasActiveSub: fansWithActiveSub.has(u.id),
      creatorIds: Array.from(creatorIdsByFan.get(u.id) ?? []),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Usuarios" subtitle={`${rows.length} cuenta(s) registradas`} />
      <AdminNav />

      <Card>
        <CardContent className="px-0">
          <UsersTable rows={rows} creators={creators ?? []} />
        </CardContent>
      </Card>
    </main>
  );
}

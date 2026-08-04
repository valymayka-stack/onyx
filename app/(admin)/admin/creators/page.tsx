import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { formatDate } from "@/lib/formatDate";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// No creator list existed before this — only /admin/creators/new. Deleting
// a creator (DeleteAccountButton below) needs somewhere to live, and a
// growing roster needs a home of its own regardless.
export default async function AdminCreatorsPage() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    redirect("/feed");
  }

  const admin = createAdminClient();

  const [{ data: creators }, { data: collectionRows }] = await Promise.all([
    admin.from("creators").select("id, handle, active, created_at").order("created_at", { ascending: false }),
    admin.from("content_collections").select("creator_id"),
  ]);

  const collectionCountByCreator = new Map<string, number>();
  for (const row of collectionRows ?? []) {
    collectionCountByCreator.set(row.creator_id, (collectionCountByCreator.get(row.creator_id) ?? 0) + 1);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Creadoras" subtitle={`${creators?.length ?? 0} cuenta(s) registradas`} />
      <AdminNav />

      <div className="flex justify-end">
        <Button size="sm" nativeButton={false} render={<Link href="/admin/creators/new">Nueva</Link>}>
          <UserPlus data-icon="inline-start" />
          Nueva creadora
        </Button>
      </div>

      {creators && creators.length > 0 ? (
        <div className="flex flex-col gap-3">
          {creators.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">@{c.handle}</p>
                    <p className="text-xs text-muted-foreground">
                      {collectionCountByCreator.get(c.id) ?? 0} colección(es) · creada el{" "}
                      {formatDate(c.created_at)}
                    </p>
                  </div>
                  {c.active ? (
                    <Badge variant="secondary">activa</Badge>
                  ) : (
                    <Badge variant="outline">inactiva</Badge>
                  )}
                </div>
                <DeleteAccountButton
                  endpoint="/api/admin/delete-creator"
                  bodyKey="creatorId"
                  id={c.id}
                  confirmText={c.handle}
                  redirectTo="/admin/creators"
                  warningDetail={`Esto elimina permanentemente a @${c.handle}, todas sus colecciones, fotos, y accesos otorgados a fans. El historial de consentimiento y pagos se conserva de forma anónima.`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguna creadora.</p>
      )}
    </main>
  );
}

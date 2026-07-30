import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// This page's data comes entirely from the service-role-backed RLS admin
// policies (content_collections_admin_all), not a build-time-cacheable
// query — see the same note on /admin/users for why this must stay fresh.
export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  const supabase = await createClient();

  // Admin RLS (content_collections_admin_all) makes this select return every
  // collection across every creator, not just ones this session owns.
  const { data: collections } = await supabase
    .from("content_collections")
    .select("id, title, is_hidden, creators(handle)")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Colecciones" subtitle="Crea y administra colecciones de cualquier creadora" />
      <AdminNav />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Todas las colecciones ({collections?.length ?? 0})
        </h2>
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href="/admin/collections/new">Nueva</Link>}
        >
          <FolderPlus data-icon="inline-start" />
          Nueva
        </Button>
      </div>

      {collections && collections.length > 0 ? (
        <div className="flex flex-col gap-2">
          {collections.map((c) => {
            const creator = (
              c.creators as unknown as { handle: string }[] | { handle: string } | null
            ) instanceof Array
              ? (c.creators as unknown as { handle: string }[])[0]
              : (c.creators as unknown as { handle: string } | null);

            return (
              <Card key={c.id}>
                <CardContent className="flex items-center gap-3">
                  <Link
                    href={`/admin/collections/${c.id}`}
                    className="flex-1 truncate text-sm"
                  >
                    {c.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    @{creator?.handle ?? "—"}
                  </span>
                  {c.is_hidden && <Badge variant="destructive">oculta</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay colecciones creadas.</p>
      )}
    </main>
  );
}

import Link from "next/link";
import { ImageIcon, FolderPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ContentUploadForm from "@/components/ContentUploadForm";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: consent } = await supabase
    .from("consent_records")
    .select("id, subject_name")
    .eq("granted_by", user!.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: items } = await supabase
    .from("content_items")
    .select("id, storage_path, content_type, is_premium, is_hidden, created_at")
    .eq("creator_id", user!.id)
    .is("collection_id", null)
    .order("created_at", { ascending: false });

  const { data: collections } = await supabase
    .from("content_collections")
    .select("id, title, is_hidden")
    .eq("creator_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Estudio" subtitle="Sube y administra tu contenido" />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Colecciones privadas ({collections?.length ?? 0})
          </h2>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/studio/collections/new">Nueva</Link>}
          >
            <FolderPlus data-icon="inline-start" />
            Nueva
          </Button>
        </div>
        {collections && collections.length > 0 ? (
          <div className="flex flex-col gap-2">
            {collections.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center gap-3">
                  <Link href={`/studio/collections/${c.id}`} className="flex-1 truncate text-sm">
                    {c.title}
                  </Link>
                  {c.is_hidden && <Badge variant="destructive">oculta por admin</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no creas ninguna colección privada.
          </p>
        )}
      </section>

      {!consent ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Necesitas registrar un consentimiento antes de subir contenido.
            </p>
            <Button nativeButton={false} render={<Link href="/studio/consent">Registrar consentimiento</Link>} />
          </CardContent>
        </Card>
      ) : (
        <ContentUploadForm consentRecordId={consent.id} />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Fotos sueltas ({items?.length ?? 0})
        </h2>
        {items && items.length > 0 ? (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <ImageIcon className="size-4" />
                  </div>
                  <span className="flex-1 truncate text-sm">
                    {item.storage_path.split("/").pop()}
                  </span>
                  <Badge variant={item.is_premium ? "default" : "secondary"}>
                    {item.is_premium ? "premium" : "público"}
                  </Badge>
                  {item.is_hidden && <Badge variant="destructive">oculto por admin</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no subes nada.</p>
        )}
      </section>
    </main>
  );
}

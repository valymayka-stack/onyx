import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import CollectionCreateForm from "@/components/CollectionCreateForm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function NewCollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: consent } = await supabase
    .from("consent_records")
    .select("id")
    .eq("granted_by", user!.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Nueva colección" subtitle="Fotos con portada, precio y acceso privado" />

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
        <CollectionCreateForm consentRecordId={consent.id} />
      )}
    </main>
  );
}

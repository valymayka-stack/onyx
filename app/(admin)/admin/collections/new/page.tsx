import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import AdminCollectionCreateForm from "@/components/admin/AdminCollectionCreateForm";

export const dynamic = "force-dynamic";

export default async function AdminNewCollectionPage() {
  const supabase = await createClient();

  const { data: creators } = await supabase
    .from("creators")
    .select("id, handle")
    .order("handle", { ascending: true });

  // One consent record per creator (the same "latest active" query the
  // creator's own /studio/collections/new page runs for itself) — an admin
  // picks the creator, but the collection still needs to be tied to *that*
  // creator's own consent, not the admin's.
  const { data: consentRows } = await supabase
    .from("consent_records")
    .select("id, granted_by, created_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const latestConsentByCreator = new Map<string, string>();
  for (const row of consentRows ?? []) {
    if (!latestConsentByCreator.has(row.granted_by)) {
      latestConsentByCreator.set(row.granted_by, row.id);
    }
  }

  const creatorsWithConsent = (creators ?? []).map((c) => ({
    id: c.id,
    handle: c.handle,
    consentRecordId: latestConsentByCreator.get(c.id) ?? null,
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Nueva colección" subtitle="Elige para qué creadora es" />
      <AdminNav />
      <AdminCollectionCreateForm creators={creatorsWithConsent} />
    </main>
  );
}

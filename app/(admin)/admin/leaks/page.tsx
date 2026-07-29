import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatDate";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import RunScanButton from "@/components/leakwatch/RunScanButton";
import LeakFindingsTable, {
  type LeakFindingRow,
} from "@/components/leakwatch/LeakFindingsTable";
import LeakTargetForm from "@/components/leakwatch/LeakTargetForm";
import LegalContactForm from "@/components/leakwatch/LegalContactForm";
import DmcaNoticesList from "@/components/leakwatch/DmcaNoticesList";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function LeaksAdminPage() {
  const supabase = await createClient();

  const { data: findingsRaw } = await supabase
    .from("leak_findings")
    .select(
      "id, item_url, subject_name, status, first_seen_at, leak_watch_targets(site_label)",
    )
    .order("first_seen_at", { ascending: false });

  const findings: LeakFindingRow[] = (findingsRaw ?? []).map((f) => ({
    id: f.id,
    item_url: f.item_url,
    subject_name: f.subject_name,
    status: f.status,
    first_seen_at: f.first_seen_at,
    // Supabase's JS client types this embedded relation as an array even
    // though target_id is a to-one FK — it's always exactly one row here.
    site_label:
      (f.leak_watch_targets as unknown as { site_label: string }[] | { site_label: string } | null) instanceof Array
        ? (f.leak_watch_targets as unknown as { site_label: string }[])[0]?.site_label ?? "—"
        : (f.leak_watch_targets as unknown as { site_label: string } | null)?.site_label ?? "—",
  }));

  const { data: contacts } = await supabase
    .from("creator_legal_contacts")
    .select("subject_name, agent_name, agent_email, agent_address");

  const legalContactsBySubject = Object.fromEntries(
    (contacts ?? []).map((c) => [
      c.subject_name,
      { agent_name: c.agent_name, agent_email: c.agent_email, agent_address: c.agent_address },
    ]),
  );

  const { data: targets } = await supabase
    .from("leak_watch_targets")
    .select("id, subject_name, site_label, url, active, blocked_reason, last_checked_at")
    .order("created_at", { ascending: false });

  const { data: notices } = await supabase
    .from("dmca_notices")
    .select("id, finding_id, subject_name, recipient_hint, notice_text, status, created_at")
    .order("created_at", { ascending: false });

  const pendingCount = findings.filter((f) => f.status === "pending_review").length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <AppHeader
        title="Monitoreo de fugas"
        subtitle={`${pendingCount} hallazgo(s) pendiente(s) de revisión`}
      />
      <AdminNav />

      <RunScanButton />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Hallazgos</h2>
        <LeakFindingsTable findings={findings} legalContactsBySubject={legalContactsBySubject} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Sitios vigilados ({targets?.length ?? 0})
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Estado actual</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {targets && targets.length > 0 ? (
              targets.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span>
                    {t.site_label} — {t.subject_name}
                  </span>
                  {t.blocked_reason ? (
                    <Badge variant="destructive">{t.blocked_reason}</Badge>
                  ) : (
                    <Badge variant="outline">
                      {t.last_checked_at
                        ? `revisado ${formatDateTime(t.last_checked_at)}`
                        : "sin revisar aún"}
                    </Badge>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin sitios registrados.</p>
            )}
          </CardContent>
        </Card>
        <LeakTargetForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Contactos legales</h2>
        <LegalContactForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Avisos DMCA generados</h2>
        <DmcaNoticesList notices={notices ?? []} />
      </section>
    </main>
  );
}

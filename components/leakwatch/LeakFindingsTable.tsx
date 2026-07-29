"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { buildDmcaNotice } from "@/lib/leakwatch/dmcaTemplate";
import { formatDateTime } from "@/lib/formatDate";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type LegalContact = {
  agent_name: string;
  agent_email: string;
  agent_address: string | null;
};

export interface LeakFindingRow {
  id: string;
  item_url: string;
  subject_name: string;
  status: string;
  first_seen_at: string;
  site_label: string;
}

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "destructive" | "default"> = {
  pending_review: "outline",
  confirmed: "secondary",
  dismissed: "secondary",
  notice_sent: "default",
};

export default function LeakFindingsTable({
  findings,
  legalContactsBySubject,
}: {
  findings: LeakFindingRow[];
  legalContactsBySubject: Record<string, LegalContact>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleConfirm(finding: LeakFindingRow) {
    setError(null);
    const contact = legalContactsBySubject[finding.subject_name];

    if (!contact) {
      setError(
        `Registra primero el contacto legal para "${finding.subject_name}" antes de generar un aviso.`,
      );
      return;
    }

    setPendingId(finding.id);
    const supabase = createClient();

    const noticeText = buildDmcaNotice({
      subjectName: finding.subject_name,
      itemUrl: finding.item_url,
      siteLabel: finding.site_label,
      agentName: contact.agent_name,
      agentEmail: contact.agent_email,
      agentAddress: contact.agent_address,
    });

    const { error: noticeError } = await supabase.from("dmca_notices").insert({
      finding_id: finding.id,
      subject_name: finding.subject_name,
      recipient_hint: finding.site_label,
      notice_text: noticeText,
    });

    if (noticeError) {
      setPendingId(null);
      setError(noticeError.message);
      return;
    }

    await supabase
      .from("leak_findings")
      .update({ status: "confirmed", reviewed_at: new Date().toISOString() })
      .eq("id", finding.id);

    setPendingId(null);
    router.refresh();
  }

  async function handleDismiss(finding: LeakFindingRow) {
    setError(null);
    setPendingId(finding.id);

    const supabase = createClient();
    await supabase
      .from("leak_findings")
      .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
      .eq("id", finding.id);

    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sitio</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Primera vez visto</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.length > 0 ? (
            findings.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.site_label}</TableCell>
                <TableCell className="max-w-xs truncate">
                  <a
                    href={f.item_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {f.item_url}
                  </a>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[f.status] ?? "outline"}>{f.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(f.first_seen_at)}
                </TableCell>
                <TableCell>
                  {f.status === "pending_review" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pendingId === f.id}
                        onClick={() => handleConfirm(f)}
                      >
                        Confirmar y generar aviso
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === f.id}
                        onClick={() => handleDismiss(f)}
                      >
                        Descartar
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="p-4 text-center text-muted-foreground">
                Sin hallazgos todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface DmcaNoticeRow {
  id: string;
  finding_id: string;
  subject_name: string;
  recipient_hint: string | null;
  notice_text: string;
  status: string;
  created_at: string;
}

export default function DmcaNoticesList({ notices }: { notices: DmcaNoticeRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleMarkSent(notice: DmcaNoticeRow) {
    setPendingId(notice.id);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("dmca_notices")
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_by: user?.id })
      .eq("id", notice.id);

    await supabase
      .from("leak_findings")
      .update({ status: "notice_sent" })
      .eq("id", notice.finding_id);

    setPendingId(null);
    router.refresh();
  }

  if (notices.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay avisos generados.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {notices.map((notice) => (
        <Card key={notice.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {notice.subject_name} — {notice.recipient_hint ?? "sin destino"}
            </CardTitle>
            <Badge variant={notice.status === "sent" ? "default" : "outline"}>
              {notice.status}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
              {notice.notice_text}
            </pre>
            {notice.status === "draft" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === notice.id}
                onClick={() => handleMarkSent(notice)}
              >
                Marcar como enviado
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

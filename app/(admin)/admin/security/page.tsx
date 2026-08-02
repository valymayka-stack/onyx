import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatDate";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
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

// Kept in sync with AUTO_BAN_EVENT_TYPES in app/api/security-events/route.ts
// (plus bulk_download_suspected, which bans through its own route in
// app/api/content/[itemId]/route.ts rather than that one) — purely for the
// destructive badge below, so this list drifting out of sync doesn't affect
// any actual ban decision, just whether this page highlights it correctly.
// "blur" itself is deliberately NOT in this set even though it can ban — a
// single blur row never bans on its own, only the 3rd-within-2-minutes does
// (see countRecentBlurEvents), so flagging every blur row here would be
// misleading; the ban it eventually causes shows up in ban_history under
// "excessive_tab_switching" instead.
const BAN_TRIGGERING_EVENTS = new Set([
  "devtools_key_blocked",
  "devtools_suspected",
  "drag_blocked",
  "selection_blocked",
  "external_capture_suspected",
  "automation_detected",
  "printscreen_key_detected",
  "save_or_print_blocked",
  "bulk_download_suspected",
]);

export default async function AdminSecurityPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("security_events")
    .select("id, event_type, user_id, ip, device_fingerprint, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <AppHeader
        title="Seguridad"
        subtitle="Eventos de seguridad registrados en el sandbox"
      />
      <AdminNav />

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Cuándo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events && events.length > 0 ? (
                events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <Badge
                        variant={
                          BAN_TRIGGERING_EVENTS.has(ev.event_type)
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {ev.event_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.user_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell>{ev.ip ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.device_fingerprint ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                      {ev.metadata ? JSON.stringify(ev.metadata) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(ev.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Sin eventos todavía.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

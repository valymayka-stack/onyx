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

const BAN_TRIGGERING_EVENTS = new Set([
  "honeypot_click",
  "devtools_key_blocked",
  "devtools_suspected",
]);

export default async function AdminSecurityPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("security_events")
    .select("id, event_type, user_id, ip, device_fingerprint, created_at")
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
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(ev.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LegalContactForm() {
  const router = useRouter();
  const [subjectName, setSubjectName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentAddress, setAgentAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("creator_legal_contacts").upsert({
      subject_name: subjectName,
      agent_name: agentName,
      agent_email: agentEmail,
      agent_address: agentAddress || null,
      updated_at: new Date().toISOString(),
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contacto legal (quien firma los avisos)</CardTitle>
        <CardDescription>
          Requiere autorización previa de la persona para actuar como su agente
          de derechos de autor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lc-subjectName">Nombre de la persona/marca</Label>
            <Input
              id="lc-subjectName"
              required
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agentName">Nombre del agente</Label>
              <Input
                id="agentName"
                required
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agentEmail">Email del agente</Label>
              <Input
                id="agentEmail"
                type="email"
                required
                value={agentEmail}
                onChange={(e) => setAgentEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agentAddress">Dirección (opcional)</Label>
            <Input
              id="agentAddress"
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Guardar contacto"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

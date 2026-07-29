"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ConsentForm() {
  const router = useRouter();
  const [subjectName, setSubjectName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      setError("Sesión no encontrada.");
      return;
    }

    const { error } = await supabase.from("consent_records").insert({
      subject_name: subjectName,
      granted_by: user.id,
      scope: "sandbox-content-distribution",
      consent_given_at: new Date().toISOString(),
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/studio");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Registrar consentimiento</CardTitle>
        <CardDescription>
          Requerido antes de poder subir contenido (Ley Olimpia). En el
          sandbox esto lo registra el propio operador para contenido de
          prueba.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subjectName">Nombre de quien consiente</Label>
            <Input
              id="subjectName"
              required
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Registrar y continuar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

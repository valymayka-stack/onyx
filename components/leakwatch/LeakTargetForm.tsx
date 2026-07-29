"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LeakTargetForm() {
  const router = useRouter();
  const [subjectName, setSubjectName] = useState("");
  const [url, setUrl] = useState("");
  const [siteLabel, setSiteLabel] = useState("");
  const [linkPattern, setLinkPattern] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("leak_watch_targets").insert({
      subject_name: subjectName,
      url,
      site_label: siteLabel,
      link_pattern: linkPattern,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setUrl("");
    setSiteLabel("");
    setLinkPattern("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agregar sitio a vigilar</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subjectName">Nombre de la persona/marca</Label>
              <Input
                id="subjectName"
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="siteLabel">Nombre del sitio</Label>
              <Input
                id="siteLabel"
                required
                placeholder="packsde.pro"
                value={siteLabel}
                onChange={(e) => setSiteLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url">URL a vigilar</Label>
            <Input
              id="url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="linkPattern">
              Patrón (regex) para detectar cada pieza de contenido
            </Label>
            <Input
              id="linkPattern"
              required
              placeholder="https://packsde\.pro/silvia-montalvo/[a-z0-9-]+/"
              value={linkPattern}
              onChange={(e) => setLinkPattern(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Agregar sitio"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

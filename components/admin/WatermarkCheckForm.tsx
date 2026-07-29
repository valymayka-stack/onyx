"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, HelpCircle, Ban } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface ExtractResult {
  match: {
    userId: string;
    displayName: string | null;
    bannedAt: string | null;
    sessionId: string;
    deliveredAt: string;
    itemFilename: string | null;
    creatorHandle: string | null;
    distance: number;
  } | null;
  recoveredCode: string;
  confidence: number;
  totalBits: number;
  closestDistance?: number | null;
}

export default function WatermarkCheckForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [banning, setBanning] = useState(false);

  async function handleBan(userId: string) {
    if (
      !confirm(
        "Esto suspende la cuenta de este usuario de inmediato y cierra su sesión. ¿Continuar?",
      )
    )
      return;

    setBanning(true);
    await fetch("/api/admin/watermark/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setBanning(false);
    setResult((prev) =>
      prev?.match
        ? { ...prev, match: { ...prev.match, bannedAt: new Date().toISOString() } }
        : prev,
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch("/api/admin/watermark/extract", {
      method: "POST",
      body: formData,
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo analizar la imagen.");
      return;
    }

    setResult(await res.json());
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <HelpCircle />
        <AlertDescription>
          Detecta la marca de agua invisible en una imagen sospechosa de haberse filtrado.
          Sobrevive recortes moderados (probado hasta ~20%) y compresión JPEG normal — no
          garantiza detectar rotación, ediciones fuertes, ni recortes muy severos.{" "}
          <strong>Tampoco sobrevive un cambio de tamaño/escala</strong> (por ejemplo, una captura
          de pantalla que muestra la foto más pequeña de como se entregó originalmente): sube el
          archivo con la mayor resolución posible.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subir imagen a verificar</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="check-file">Archivo</Label>
              <Input
                id="check-file"
                type="file"
                accept="image/*"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading || !file}>
              {loading ? "Analizando…" : "Verificar marca"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {result.match ? (
              <>
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <CheckCircle2 className="size-4" />
                  Coincidencia encontrada
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Usuario</dt>
                  <dd>{result.match.displayName ?? result.match.userId.slice(0, 8)}</dd>
                  <dt className="text-muted-foreground">Creadora</dt>
                  <dd>{result.match.creatorHandle ? `@${result.match.creatorHandle}` : "—"}</dd>
                  <dt className="text-muted-foreground">Archivo</dt>
                  <dd className="truncate">{result.match.itemFilename ?? "—"}</dd>
                  <dt className="text-muted-foreground">Entregado</dt>
                  <dd>{new Date(result.match.deliveredAt).toLocaleString()}</dd>
                  <dt className="text-muted-foreground">Coincidencia</dt>
                  <dd>
                    <Badge variant="secondary">
                      {result.totalBits - result.match.distance}/{result.totalBits} bits
                    </Badge>
                  </dd>
                </dl>

                {result.match.bannedAt ? (
                  <Badge variant="destructive" className="w-fit">
                    Cuenta suspendida
                  </Badge>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-fit"
                    disabled={banning}
                    onClick={() => handleBan(result.match!.userId)}
                  >
                    <Ban data-icon="inline-start" />
                    {banning ? "Suspendiendo…" : "Banear a este usuario"}
                  </Button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="size-4" />
                No se encontró ninguna coincidencia confiable
                {typeof result.closestDistance === "number" && (
                  <span>
                    (la más cercana difiere en {result.closestDistance}/{result.totalBits} bits)
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

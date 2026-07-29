"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CollectionEditForm({
  collectionId,
  initialTitle,
  initialDescription,
  initialPriceCents,
}: {
  collectionId: string;
  initialTitle: string;
  initialDescription: string | null;
  initialPriceCents: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [priceDollars, setPriceDollars] = useState((initialPriceCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const priceCents = Math.round(parseFloat(priceDollars) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      setError("Precio inválido.");
      return;
    }

    setLoading(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("content_collections")
      .update({ title, description, price_cents: priceCents })
      .eq("id", collectionId);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Editar colección</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-title">Título</Label>
            <Input id="edit-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-desc">Descripción</Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-price">Precio (USD)</Label>
            <Input
              id="edit-price"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {saved && !error && (
            <Alert>
              <CheckCircle2 />
              <AlertDescription>Cambios guardados.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading}>
            <Save data-icon="inline-start" />
            {loading ? "Guardando…" : "Guardar cambios"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

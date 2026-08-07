"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CollectionEditForm({
  collectionId,
  initialTitle,
  initialDescription,
  isAdmin = false,
  initialTelegramChannelCode = "",
  initialIsFeed = false,
}: {
  collectionId: string;
  initialTitle: string;
  initialDescription: string | null;
  isAdmin?: boolean;
  initialTelegramChannelCode?: string;
  initialIsFeed?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [telegramChannelCode, setTelegramChannelCode] = useState(initialTelegramChannelCode);
  const [isFeed, setIsFeed] = useState(initialIsFeed);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("content_collections")
      .update(
        isAdmin
          ? {
              title,
              description,
              telegram_channel_code: telegramChannelCode.trim() || null,
              is_feed: isFeed,
            }
          : { title, description },
      )
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

          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-telegram-code">Código de canal de Telegram (opcional)</Label>
              <Input
                id="edit-telegram-code"
                placeholder="ej. lady_in_red"
                value={telegramChannelCode}
                onChange={(e) => setTelegramChannelCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Debe coincidir exactamente con el channel_key del bot. Déjalo vacío si esta
                colección no tiene canal de Telegram equivalente.
              </p>
            </div>
          )}

          {isAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isFeed}
                onCheckedChange={(checked) => setIsFeed(checked === true)}
              />
              Modo feed (estilo Grupo) — se muestra como scroll infinito de posts en vez de
              carrusel, y permite publicar solo texto.
            </label>
          )}

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

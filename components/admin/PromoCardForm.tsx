"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Uploads straight to the public "promo-assets" bucket, unlike every other
// upload in the app — this photo isn't gated fan content, it's a marketing
// image meant to be shown to everyone, so it skips watermarking/signed
// tokens/rate limiting entirely (see 0018_promo_cards.sql for why).
export default function PromoCardForm({ nextSortOrder }: { nextSortOrder: number }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo || !title.trim() || !linkUrl.trim()) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const ext = photo.name.split(".").pop() || "jpg";
      const path = `promo/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("promo-assets")
        .upload(path, photo, { contentType: photo.type });
      if (uploadError) throw new Error(uploadError.message);

      const { error: insertError } = await supabase.from("promo_cards").insert({
        photo_path: path,
        title: title.trim(),
        description: description.trim() || null,
        link_url: linkUrl.trim(),
        is_active: true,
        sort_order: nextSortOrder,
      });
      if (insertError) throw new Error(insertError.message);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "No se pudo crear la tarjeta.");
      return;
    }

    setLoading(false);
    setPhoto(null);
    setTitle("");
    setDescription("");
    setLinkUrl("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva tarjeta</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-photo">Foto</Label>
            <Input
              id="promo-photo"
              type="file"
              accept="image/*"
              required
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-title">Título</Label>
            <Input
              id="promo-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ej. Marissa"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-desc">Descripción breve</Label>
            <Textarea
              id="promo-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Un par de líneas para invitar al fan a conocerla"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-link">Link de Telegram</Label>
            <Input
              id="promo-link"
              type="url"
              required
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://t.me/subscripcion_bot?start=onyx"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading || !photo || !title.trim() || !linkUrl.trim()}>
            <Plus data-icon="inline-start" />
            {loading ? "Creando…" : "Crear tarjeta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

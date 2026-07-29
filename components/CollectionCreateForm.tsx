"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CollectionCreateForm({
  consentRecordId,
}: {
  consentRecordId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cover || photos.length === 0) return;

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

    const priceCents = Math.round(parseFloat(priceDollars) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      setLoading(false);
      setError("Precio inválido.");
      return;
    }

    const { data: newCollection, error: collectionError } = await supabase
      .from("content_collections")
      .insert({ creator_id: user.id, title, description, price_cents: priceCents })
      .select("id")
      .single();

    if (collectionError || !newCollection) {
      setLoading(false);
      setError(collectionError?.message ?? "No se pudo crear la colección.");
      return;
    }

    const collectionId = newCollection.id;

    async function uploadOne(file: File, isCover: boolean) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user!.id}/collections/${collectionId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("content-raw")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { data: item, error: insertError } = await supabase
        .from("content_items")
        .insert({
          creator_id: user!.id,
          storage_path: path,
          content_type: "image",
          is_premium: true,
          collection_id: collectionId,
          is_cover: isCover,
          consent_record_id: consentRecordId,
        })
        .select("id")
        .single();
      if (insertError || !item) throw new Error(insertError?.message ?? "upload failed");
      return item.id;
    }

    try {
      const coverItemId = await uploadOne(cover, true);
      for (const photo of photos) {
        await uploadOne(photo, false);
      }
      await supabase
        .from("content_collections")
        .update({ cover_item_id: coverItemId })
        .eq("id", collectionId);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "No se pudo subir el contenido.");
      return;
    }

    setLoading(false);
    router.push(`/studio/collections/${collectionId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva colección</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-title">Título</Label>
            <Input id="col-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-desc">Descripción</Label>
            <Textarea id="col-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-price">Precio (USD)</Label>
            <Input
              id="col-price"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-cover">Portada</Label>
            <Input
              id="col-cover"
              type="file"
              accept="image/*"
              required
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-photos">Fotos de la colección</Label>
            <Input
              id="col-photos"
              type="file"
              accept="image/*"
              multiple
              required
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading || !cover || photos.length === 0}>
            <FolderPlus data-icon="inline-start" />
            {loading ? "Creando…" : "Crear colección"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

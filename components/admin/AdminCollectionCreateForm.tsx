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

interface CreatorOption {
  id: string;
  handle: string;
  consentRecordId: string | null;
}

// Same creation logic as the creator's own CollectionCreateForm — the admin
// bypass policies on content_collections/content_items/storage(content-raw)
// (see 0002_rls.sql, 0008_collections.sql) mean this can insert rows and
// upload files for *any* creator, not just the signed-in account, without
// going through a separate service-role API route.
export default function AdminCollectionCreateForm({
  creators,
}: {
  creators: CreatorOption[];
}) {
  const router = useRouter();
  const [creatorId, setCreatorId] = useState(creators[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedCreator = creators.find((c) => c.id === creatorId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cover || photos.length === 0 || !selectedCreator) return;

    if (!selectedCreator.consentRecordId) {
      setError(
        `@${selectedCreator.handle} todavía no tiene un consentimiento registrado — no se puede crear contenido para esa cuenta hasta que lo tenga.`,
      );
      return;
    }
    const consentRecordId = selectedCreator.consentRecordId;

    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data: newCollection, error: collectionError } = await supabase
      .from("content_collections")
      .insert({ creator_id: creatorId, title, description })
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
      const path = `${creatorId}/collections/${collectionId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("content-raw")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { data: item, error: insertError } = await supabase
        .from("content_items")
        .insert({
          creator_id: creatorId,
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
    router.push(`/admin/collections/${collectionId}`);
  }

  if (creators.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Todavía no hay ninguna cuenta de creadora — créala primero.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva colección</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-creator">Creadora</Label>
            <select
              id="col-creator"
              required
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm"
            >
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  @{c.handle}
                  {c.consentRecordId ? "" : " (sin consentimiento)"}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-title">Título</Label>
            <Input id="col-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-desc">Descripción</Label>
            <Textarea id="col-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
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

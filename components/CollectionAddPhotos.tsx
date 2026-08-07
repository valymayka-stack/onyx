"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { MAX_UPLOAD_BYTES, oversizedFileMessage, isVideoFile } from "@/lib/uploadLimits";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// datetime-local gives a naive "YYYY-MM-DDTHH:mm" string with no timezone —
// `new Date(...)` would interpret it using whatever timezone the uploading
// device happens to be set to, which isn't reliable. Mexico City has had no
// DST since the 2022 reform, so its offset is a fixed -06:00 year-round —
// appending it explicitly makes the entered time deterministic regardless
// of the browser's own clock/timezone settings.
function mexicoCityDateTimeToIso(datetimeLocal: string): string {
  return new Date(`${datetimeLocal}:00-06:00`).toISOString();
}

export default function CollectionAddPhotos({
  collectionId,
  creatorId,
  consentRecordId,
}: {
  collectionId: string;
  creatorId: string;
  consentRecordId: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    const oversized = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      setError(oversizedFileMessage(oversized));
      return;
    }

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

    try {
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${creatorId}/collections/${collectionId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("content-raw")
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw new Error(uploadError.message);

        const { error: insertError } = await supabase.from("content_items").insert({
          creator_id: creatorId,
          storage_path: path,
          content_type: isVideoFile(file) ? "video" : "image",
          is_premium: true,
          collection_id: collectionId,
          is_cover: false,
          consent_record_id: consentRecordId,
          caption: caption.trim() || null,
          publish_at: publishAt ? mexicoCityDateTimeToIso(publishAt) : null,
        });
        if (insertError) throw new Error(insertError.message);
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "No se pudo subir el contenido.");
      return;
    }

    setLoading(false);
    setFiles([]);
    setCaption("");
    setPublishAt("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Añadir fotos</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-photos">Archivos</Label>
            <Input
              id="add-photos"
              type="file"
              accept="image/*,video/*"
              multiple
              required
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-photos-caption">Texto (opcional)</Label>
            <Textarea
              id="add-photos-caption"
              placeholder="Se muestra junto a las fotos, como el pie de foto de un post."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-photos-publish-at">Publicar el (opcional)</Label>
            <Input
              id="add-photos-publish-at"
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Vacío = visible de inmediato. Con fecha, no aparece en el feed del fan hasta ese momento.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading || files.length === 0}>
            <Upload data-icon="inline-start" />
            {loading ? "Subiendo…" : "Añadir a la colección"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

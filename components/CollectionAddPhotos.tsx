"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { MAX_UPLOAD_BYTES, oversizedFileMessage, isVideoFile } from "@/lib/uploadLimits";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CollectionAddPhotos({
  collectionId,
  consentRecordId,
}: {
  collectionId: string;
  consentRecordId: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
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
        const path = `${user.id}/collections/${collectionId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("content-raw")
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw new Error(uploadError.message);

        const { error: insertError } = await supabase.from("content_items").insert({
          creator_id: user.id,
          storage_path: path,
          content_type: isVideoFile(file) ? "video" : "image",
          is_premium: true,
          collection_id: collectionId,
          is_cover: false,
          consent_record_id: consentRecordId,
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

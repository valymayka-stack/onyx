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
  isFeed = false,
}: {
  collectionId: string;
  creatorId: string;
  consentRecordId: string;
  isFeed?: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Publicando…");

  // In feed mode a post can be text-only, so "nothing to submit" means no
  // files AND no caption — classic collections keep requiring a file.
  const textOnlyPost = isFeed && files.length === 0;
  const canSubmit = isFeed ? files.length > 0 || caption.trim().length > 0 : files.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

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

    // Shared by every row inserted from this submit, so a multi-file batch
    // (or a text-only post) renders as one post in the feed instead of one
    // card per file — see components/GroupFeedViewer.tsx.
    const postGroupId = crypto.randomUUID();

    try {
      if (textOnlyPost) {
        const { error: insertError } = await supabase.from("content_items").insert({
          creator_id: creatorId,
          storage_path: null,
          content_type: "text",
          is_premium: true,
          collection_id: collectionId,
          is_cover: false,
          consent_record_id: consentRecordId,
          caption: caption.trim(),
          publish_at: publishAt ? mexicoCityDateTimeToIso(publishAt) : null,
          post_group_id: postGroupId,
        });
        if (insertError) throw new Error(insertError.message);
      } else {
        for (const file of files) {
          const isVideo = isVideoFile(file);
          let path: string;

          if (isVideo) {
            // Routed through the server instead of a direct browser->Storage
            // upload: a phone's raw export (.MOV/HEVC, etc.) plays fine on
            // the device that recorded it but not in most fans' browsers —
            // this transcodes to a universally-playable H.264/AAC mp4 first
            // (see app/api/studio/upload-video/route.ts).
            setLoadingLabel("Procesando video… puede tardar un poco");
            const videoForm = new FormData();
            videoForm.set("collectionId", collectionId);
            videoForm.set("file", file);
            const res = await fetch("/api/studio/upload-video", {
              method: "POST",
              body: videoForm,
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error ?? "No se pudo procesar el video.");
            path = body.storagePath;
            setLoadingLabel("Publicando…");
          } else {
            const ext = file.name.split(".").pop() || "jpg";
            path = `${creatorId}/collections/${collectionId}/${crypto.randomUUID()}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("content-raw")
              .upload(path, file, { contentType: file.type });
            if (uploadError) throw new Error(uploadError.message);
          }

          const { error: insertError } = await supabase.from("content_items").insert({
            creator_id: creatorId,
            storage_path: path,
            content_type: isVideo ? "video" : "image",
            is_premium: true,
            collection_id: collectionId,
            is_cover: false,
            consent_record_id: consentRecordId,
            caption: caption.trim() || null,
            publish_at: publishAt ? mexicoCityDateTimeToIso(publishAt) : null,
            post_group_id: postGroupId,
          });
          if (insertError) throw new Error(insertError.message);
        }
      }
    } catch (err) {
      setLoading(false);
      setLoadingLabel("Publicando…");
      setError(err instanceof Error ? err.message : "No se pudo subir el contenido.");
      return;
    }

    setLoading(false);
    setLoadingLabel("Publicando…");
    setFiles([]);
    setCaption("");
    setPublishAt("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{isFeed ? "Nuevo post" : "Añadir fotos"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-photos">{isFeed ? "Archivos (opcional)" : "Archivos"}</Label>
            <Input
              id="add-photos"
              type="file"
              accept="image/*,video/*"
              multiple
              required={!isFeed}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-photos-caption">{isFeed ? "Texto" : "Texto (opcional)"}</Label>
            <Textarea
              id="add-photos-caption"
              placeholder={
                isFeed
                  ? "Escribe el post. Puedes dejarlo solo con texto, sin foto."
                  : "Se muestra junto a las fotos, como el pie de foto de un post."
              }
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

          <Button type="submit" disabled={loading || !canSubmit}>
            <Upload data-icon="inline-start" />
            {loading ? loadingLabel : isFeed ? "Publicar" : "Añadir a la colección"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

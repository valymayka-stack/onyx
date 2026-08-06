"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { MAX_UPLOAD_BYTES, oversizedFileMessage, isVideoFile } from "@/lib/uploadLimits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AdminAddPhotoForm({
  creatorId,
  collectionId,
  consentRecordId,
}: {
  creatorId: string;
  collectionId: string | null;
  consentRecordId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(oversizedFileMessage(file));
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const ext = file.name.split(".").pop() || "jpg";
    const folder = collectionId ? `${creatorId}/collections/${collectionId}` : creatorId;
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("content-raw")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setLoading(false);
      setError(uploadError.message);
      return;
    }

    await supabase.from("content_items").insert({
      creator_id: creatorId,
      storage_path: path,
      content_type: isVideoFile(file) ? "video" : "image",
      is_premium: true,
      collection_id: collectionId,
      consent_record_id: consentRecordId,
    });

    setLoading(false);
    setFile(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/*,video/*"
          className="max-w-56"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button type="submit" size="sm" disabled={loading || !file}>
          <Upload data-icon="inline-start" />
          {loading ? "Subiendo…" : "Añadir"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

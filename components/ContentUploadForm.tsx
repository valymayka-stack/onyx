"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ContentUploadForm({
  consentRecordId,
}: {
  consentRecordId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isPremium, setIsPremium] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

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

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("content-raw")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setLoading(false);
      setError(uploadError.message);
      return;
    }

    const { error: insertError } = await supabase.from("content_items").insert({
      creator_id: user.id,
      storage_path: path,
      content_type: "image",
      is_premium: isPremium,
      consent_record_id: consentRecordId,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setFile(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subir contenido de prueba</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-file">Archivo</Label>
            <Input
              id="content-file"
              type="file"
              accept="image/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isPremium}
              onCheckedChange={(checked) => setIsPremium(checked === true)}
            />
            Premium (requiere suscripción activa)
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading || !file}>
            <Upload data-icon="inline-start" />
            {loading ? "Subiendo…" : "Subir"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

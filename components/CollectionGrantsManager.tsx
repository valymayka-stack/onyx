"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Grant {
  fanId: string;
  email: string | null;
  displayName: string | null;
}

export default function CollectionGrantsManager({
  collectionId,
  grants,
}: {
  collectionId: string;
  grants: Grant[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/studio/collections/${collectionId}/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo dar acceso.");
      return;
    }

    setEmail("");
    router.refresh();
  }

  async function handleRevoke(fanId: string) {
    await fetch(`/api/studio/collections/${collectionId}/grants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fanId }),
    });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quién puede ver esta colección</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Solo las personas de esta lista pueden ver que esta colección existe. Nadie más la
          verá en tu perfil.
        </p>

        <form onSubmit={handleGrant} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="grant-email">Correo del usuario</Label>
            <Input
              id="grant-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            <UserPlus data-icon="inline-start" />
            Dar acceso
          </Button>
        </form>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          {grants.length > 0 ? (
            grants.map((g) => (
              <div
                key={g.fanId}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span>{g.displayName ?? g.email ?? g.fanId.slice(0, 8)}</span>
                <Button size="sm" variant="ghost" onClick={() => handleRevoke(g.fanId)}>
                  <X className="size-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no le has dado acceso a nadie.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

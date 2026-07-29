"use client";

import { useState } from "react";
import { Search, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface CollectionRow {
  id: string;
  title: string;
  isHidden: boolean;
  creatorHandle: string;
  hasAccess: boolean;
}

interface Fan {
  id: string;
  email: string;
  displayName: string | null;
}

export default function AdminAccessManager() {
  const [email, setEmail] = useState("");
  const [fan, setFan] = useState<Fan | null>(null);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFan(null);

    const res = await fetch(`/api/admin/access?email=${encodeURIComponent(email.trim())}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo buscar ese usuario.");
      return;
    }

    setFan(data.fan);
    setCollections(data.collections);
  }

  async function handleToggle(collectionId: string, hasAccess: boolean) {
    if (!fan) return;
    setTogglingId(collectionId);

    await fetch(`/api/studio/collections/${collectionId}/grants`, {
      method: hasAccess ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hasAccess ? { fanId: fan.id } : { email: fan.email }),
    });

    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? { ...c, hasAccess: !hasAccess } : c)),
    );
    setTogglingId(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accesos por usuario</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Busca a un usuario por correo y activa o quita su acceso a cualquier colección privada,
          sin tener que entrar colección por colección.
        </p>

        <form onSubmit={handleSearch} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="access-email">Correo del usuario</Label>
            <Input
              id="access-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            <Search data-icon="inline-start" />
            Buscar
          </Button>
        </form>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {fan && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{fan.displayName ?? fan.email}</p>
            {collections.length > 0 ? (
              collections.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{c.title}</span>
                    <span className="text-muted-foreground">@{c.creatorHandle}</span>
                    {c.isHidden && <Badge variant="destructive">oculta</Badge>}
                  </div>
                  <Button
                    size="sm"
                    variant={c.hasAccess ? "destructive" : "outline"}
                    disabled={togglingId === c.id}
                    onClick={() => handleToggle(c.id, c.hasAccess)}
                  >
                    {c.hasAccess ? "Quitar acceso" : "Dar acceso"}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay colecciones creadas.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

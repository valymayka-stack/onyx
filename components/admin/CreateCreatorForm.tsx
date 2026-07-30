"use client";

import { useState } from "react";
import { Dices, Copy, Check, AlertCircle, UserPlus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PASSWORD_ALPHABET =
  "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generatePassword(length = 14): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-sm" />
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          {copied ? <Check className="text-primary" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

export default function CreateCreatorForm() {
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string; handle: string } | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/create-creator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        handle: handle.trim(),
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo crear la cuenta.");
      return;
    }

    setCreated({ email: data.email, password, handle: data.handle });
    setEmail("");
    setHandle("");
    setDisplayName("");
    setBio("");
    setPassword(generatePassword());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Crear cuenta de creadora</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Sin registro público — esta es la única forma de crear una cuenta de creadora.
          A diferencia de los fans, usa un correo real: la creadora necesita poder
          iniciar sesión ella misma para configurar su 2FA y registrar su propio
          consentimiento.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator-email">Correo</Label>
            <Input
              id="creator-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator-handle">Handle</Label>
            <Input
              id="creator-handle"
              required
              pattern="[a-z0-9-]+"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="mi-creadora"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator-display-name">Nombre para mostrar (opcional)</Label>
            <Input
              id="creator-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator-bio">Bio (opcional)</Label>
            <Textarea id="creator-bio" value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator-password">Contraseña</Label>
            <div className="flex gap-2">
              <Input
                id="creator-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(generatePassword())}
                title="Generar otra"
              >
                <Dices />
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading}>
            <UserPlus data-icon="inline-start" />
            {loading ? "Creando…" : "Crear cuenta"}
          </Button>
        </form>

        {created && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              Cuenta creada (@{created.handle}) — copia estas credenciales.
            </p>
            <CopyField label="Usuario" value={created.email} />
            <CopyField label="Contraseña" value={created.password} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

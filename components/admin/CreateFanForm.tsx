"use client";

import { useState } from "react";
import { Dices, Copy, Check, AlertCircle, UserPlus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Readable alphabet — no 0/O/1/l/I, since this may need to be typed by hand
// on a phone keyboard by whoever received it from the bot.
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

export default function CreateFanForm() {
  const [telegramId, setTelegramId] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/create-fan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId: telegramId.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo crear la cuenta.");
      return;
    }

    setCreated({ email: data.email, password });
    setTelegramId("");
    setPassword(generatePassword());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Crear cuenta de fan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          El usuario será <code>&#123;telegramId&#125;@onyx.com</code>. No hay registro
          público — esta es la única forma de crear una cuenta, junto con el endpoint
          que usará el bot. La contraseña no se puede recuperar después: si el fan la
          pierde, hay que generarle una nueva.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telegram-id">Telegram ID</Label>
            <Input
              id="telegram-id"
              required
              inputMode="numeric"
              pattern="[0-9]+"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder="129803"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fan-password">Contraseña</Label>
            <div className="flex gap-2">
              <Input
                id="fan-password"
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
              Cuenta creada — copia estas credenciales, no se mostrarán de nuevo.
            </p>
            <CopyField label="Usuario" value={created.email} />
            <CopyField label="Contraseña" value={created.password} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

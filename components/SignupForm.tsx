"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { computeDeviceFingerprint } from "@/lib/security/fingerprint";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SignupForm() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Ban-gate check happens server-side before account creation — blocks a
    // banned IP or a banned device fingerprint, whichever the honeypot
    // caught last time.
    const fingerprint = computeDeviceFingerprint();
    const gate = await fetch("/api/auth/signup-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint }),
    });
    if (!gate.ok) {
      setLoading(false);
      setError("No es posible crear una cuenta en este momento.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Self-serve signup always creates a fan account (see 0003_handle_new_user.sql).
    // Full navigation so middleware sees the new session cookie right away.
    window.location.assign("/mfa/enroll");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Crear cuenta</CardTitle>
        <CardDescription>Regístrate como fan del sandbox.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          id="signup-form"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Nombre para mostrar</Label>
            <Input
              id="displayName"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 border-t-0 bg-transparent pt-0">
        <Button type="submit" form="signup-form" disabled={loading}>
          {loading ? "Creando…" : "Crear cuenta"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Después de crear tu cuenta, la app te va a pedir configurar
          verificación en dos pasos (2FA) antes de dejarte entrar.
        </p>
      </CardFooter>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { getPostLoginPath } from "@/lib/auth/postLoginRoute";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function MfaVerifyForm() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadFactor() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) {
        setError(error.message);
        return;
      }

      const verifiedTotp = data.totp.find((f) => f.status === "verified");
      if (verifiedTotp) setFactorId(verifiedTotp.id);
    }

    loadFactor();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Accounts aren't meant to be shared — completing MFA is the point a
    // login becomes "real" (aal2), so this is where any other active session
    // for this account gets kicked. Best-effort: a failure here shouldn't
    // block this login.
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});

    // A full navigation (not router.push) so the new request carries the
    // stepped-up aal2 cookie and middleware/server components see it
    // immediately — avoids a race where the client router re-fetches the
    // page it's leaving instead of the destination.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const target = user ? await getPostLoginPath(supabase, user.id) : "/feed";
    window.location.assign(target);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Verificación en dos pasos</CardTitle>
        <CardDescription>
          Ingresa el código de tu app de autenticación para continuar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totp-code">Código de 6 dígitos</Label>
            <Input
              id="totp-code"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading || !factorId}>
            {loading ? "Verificando…" : "Confirmar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

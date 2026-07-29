"use client";

import { useEffect, useRef, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";

export default function MfaEnrollForm() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode's dev-only double-invocation of
    // effects, which would otherwise fire enroll() twice concurrently and
    // create two colliding unverified factors before either write lands.
    if (startedRef.current) return;
    startedRef.current = true;

    async function enroll() {
      const supabase = createClient();

      // Revisiting this page (e.g. after a reload) leaves a previous
      // unverified factor behind, and Supabase enforces a unique friendly
      // name per user — best-effort clean it up, but don't depend on it
      // (see the explicit unique friendlyName below, which is what actually
      // guarantees no collision regardless of cleanup timing).
      const { data: existing } = await supabase.auth.mfa.listFactors();
      // supabase-js types `Factor.status` on the `totp` list as always
      // `"verified"`, but unverified factors are returned there too at
      // runtime — compare via String() to sidestep the overly-narrow type.
      const stale =
        existing?.totp.filter((f) => String(f.status) === "unverified") ?? [];
      await Promise.all(
        stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })),
      );

      // Mandatory 2FA is enforced uniformly for every account type — this
      // page only renders when middleware has confirmed the session has no
      // verified TOTP factor yet.
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `totp-${Date.now()}`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    }

    enroll();
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

    // Accounts aren't meant to be shared — see the same call in
    // MfaVerifyForm for why this lives at the MFA step rather than at the
    // password-only sign-in.
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});

    // Full navigation so the aal2-stepped-up cookie is picked up immediately
    // by middleware/server components on the destination page.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const target = user ? await getPostLoginPath(supabase, user.id) : "/feed";
    window.location.assign(target);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          Configura verificación en dos pasos
        </CardTitle>
        <CardDescription>
          Requerido para todas las cuentas. Escanea el código con Google
          Authenticator, Authy, o cualquier app TOTP.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex justify-center rounded-lg bg-white p-4">
          {qrCode ? (
            // qrCode is a `data:image/svg+xml;...` URI from Supabase — it's
            // an image source, not raw markup to inject.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrCode}
              alt="Código QR para configurar 2FA"
              width={180}
              height={180}
            />
          ) : (
            <Skeleton className="size-[180px]" />
          )}
        </div>

        {secret && (
          <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            Clave manual: {secret}
          </p>
        )}

        <form onSubmit={handleVerify} className="flex flex-col gap-3">
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

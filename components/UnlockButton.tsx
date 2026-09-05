"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = (
  | { kind: "collection"; collectionId: string; label: string }
  | { kind: "subscription"; creatorId: string; label: string }
) & { variant?: "default" | "outline" };

// Kicks off a real external Clip checkout (window.location.href, a full
// navigation) rather than an embedded widget — deliberately, after
// confirming Android WebView + third-party dynamic iframes are a known
// source of real bugs, and that Taurina's own redirect-based Clip
// integration already works in production. The webhook does the actual
// granting server-side once Clip confirms; this button only starts that.
export default function UnlockButton(props: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        props.kind === "collection" ? "/api/payments/clip/collection" : "/api/payments/clip/subscription";
      const payload =
        props.kind === "collection" ? { collectionId: props.collectionId } : { creatorId: props.creatorId };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "No se pudo iniciar el pago.");
        setLoading(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("No se pudo iniciar el pago.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={handleClick} disabled={loading} variant={props.variant ?? "default"}>
        {loading ? "Abriendo pago…" : props.label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

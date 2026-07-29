"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SubscribeButton({
  creatorId,
  priceLabel,
}: {
  creatorId: string;
  priceLabel: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/payments/fake-charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo procesar el pago.");
      return;
    }

    router.refresh();
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Contenido premium</p>
            <p className="text-sm text-muted-foreground">
              Suscríbete para desbloquear todo el contenido.
            </p>
          </div>
        </div>
        <Button onClick={handleSubscribe} disabled={loading}>
          {loading ? "Procesando…" : `Pagar ${priceLabel}`}
        </Button>
      </CardContent>
      {error && (
        <CardContent className="pt-0">
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      )}
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// No price shown here on purpose — access to a collection is a private
// grant, not a self-serve storefront listing, so by the time someone sees
// this button they already know what they agreed to elsewhere.
export default function CollectionPurchaseButton({
  collectionId,
}: {
  collectionId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/collections/${collectionId}/purchase`, {
      method: "POST",
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
    <div className="flex flex-col gap-2">
      <Button onClick={handlePurchase} disabled={loading}>
        <Unlock data-icon="inline-start" />
        {loading ? "Procesando…" : "Ver colección completa"}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

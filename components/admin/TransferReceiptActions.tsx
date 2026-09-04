"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function TransferReceiptActions({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !confirm("¿Rechazar este comprobante?")) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/transfer-receipts/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptId, decision }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo procesar.");
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Button size="sm" disabled={loading} onClick={() => decide("approve")}>
          Aprobar y dar acceso
        </Button>
        <Button size="sm" variant="destructive" disabled={loading} onClick={() => decide("reject")}>
          Rechazar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

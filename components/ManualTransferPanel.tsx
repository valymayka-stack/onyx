"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_UPLOAD_BYTES, oversizedFileMessage } from "@/lib/uploadLimits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ManualTransferPanel({
  creatorId,
  bank,
  clabe,
  accountHolder,
  concept,
  amountCents,
}: {
  creatorId: string;
  bank: string;
  clabe: string;
  accountHolder: string;
  concept: string;
  amountCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(oversizedFileMessage(file));
      return;
    }

    setLoading(true);
    setError(null);
    const body = new FormData();
    body.set("creatorId", creatorId);
    body.set("file", file);

    const res = await fetch("/api/payments/manual-transfer", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo enviar el comprobante.");
      return;
    }
    setSent(true);
    router.refresh();
  }

  if (sent) {
    return <p className="text-xs text-muted-foreground">✅ Recibimos tu comprobante, lo estamos revisando.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        o transfiere por SPEI
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-left">
      <p className="text-xs text-muted-foreground">
        Monto: <span className="font-medium text-foreground">${(amountCents / 100).toFixed(0)} MXN</span>
        <br />
        Banco: <span className="font-medium text-foreground">{bank}</span>
        <br />
        CLABE: <span className="font-medium text-foreground">{clabe}</span>
        <br />
        Beneficiario: <span className="font-medium text-foreground">{accountHolder}</span>
        <br />
        Concepto: <span className="font-medium text-foreground">{concept}</span>
      </p>
      <p className="text-xs text-muted-foreground">Sube tu comprobante para que lo revisemos:</p>
      <Input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button type="submit" size="sm" disabled={loading || !file}>
        {loading ? "Enviando…" : "Enviar comprobante"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

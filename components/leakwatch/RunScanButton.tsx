"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RunScanButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setSummary(null);

    const res = await fetch("/api/admin/leak-watch/scan", { method: "POST" });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setSummary("No se pudo correr el escaneo.");
      return;
    }

    const totalNew = (data.results ?? []).reduce(
      (sum: number, r: { newFindings: number }) => sum + r.newFindings,
      0,
    );
    setSummary(`Listo: ${totalNew} hallazgo(s) nuevo(s).`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" onClick={handleRun} disabled={loading}>
        <RefreshCw data-icon="inline-start" className={loading ? "animate-spin" : ""} />
        {loading ? "Escaneando…" : "Correr escaneo ahora"}
      </Button>
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
    </div>
  );
}

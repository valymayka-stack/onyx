"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Shared by /admin/users/[userId] (fans) and /admin/creators (creators) —
// irreversible, so unlike BanToggleButton this requires typing the exact
// confirmText (the account's email or handle) before the real request
// fires, not just a click-through native confirm().
export default function DeleteAccountButton({
  endpoint,
  bodyKey,
  id,
  confirmText,
  redirectTo,
  warningDetail,
  buttonLabel = "Eliminar cuenta permanentemente",
}: {
  endpoint: string;
  bodyKey: string;
  id: string;
  confirmText: string;
  redirectTo: string;
  buttonLabel?: string;
  warningDetail: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [bodyKey]: id }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setLoading(false);
      setError(data?.error ?? "No se pudo eliminar la cuenta.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  if (!expanded) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setExpanded(true)}>
        <Trash2 data-icon="inline-start" />
        {buttonLabel}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertDescription>{warningDetail} Esta acción no se puede deshacer.</AlertDescription>
      </Alert>

      <p className="text-sm text-muted-foreground">
        Escribe <span className="font-mono font-semibold">{confirmText}</span> para confirmar:
      </p>
      <Input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={confirmText}
        autoComplete="off"
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={typed !== confirmText || loading}
          onClick={handleDelete}
        >
          {loading ? "Eliminando…" : "Confirmar eliminación"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => {
            setExpanded(false);
            setTyped("");
            setError(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { computeDeviceFingerprint } from "@/lib/security/fingerprint";
import { Button } from "@/components/ui/button";
import BannedOverlay from "@/components/BannedOverlay";

// Decoy control — no legitimate viewer needs to "download" premium content,
// so a click is treated as intent to pirate. See app/api/honeypot/download.
// Styled to blend in as an ordinary action rather than looking suspicious.
export default function HoneypotDownloadButton({ itemId }: { itemId: string }) {
  const [banned, setBanned] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    const fingerprint = computeDeviceFingerprint();
    const res = await fetch("/api/honeypot/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, fingerprint }),
    });

    const data = await res.json().catch(() => ({}));
    setMessage(data.message ?? "Esta acción está en contra de la política de uso.");
    setBanned(true);
  }

  if (banned) {
    return (
      <BannedOverlay
        message={message ?? "Tu cuenta ha sido suspendida."}
      />
    );
  }

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={handleClick}>
      <Download data-icon="inline-start" />
      Descargar
    </Button>
  );
}

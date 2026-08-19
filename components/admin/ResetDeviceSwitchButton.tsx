"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Manually moves a fan to their other delivery channel (telegram <-> app).
// This is now the *only* way that ever happens — self-service switching was
// removed from middleware.ts (2026-08), so this is a deliberate, one-fan-
// at-a-time admin call, not a flag that lets the fan's own next request
// auto-detect and switch itself. See app/api/admin/switch-delivery-channel.
export default function ResetDeviceSwitchButton({
  userId,
  currentChannel,
}: {
  userId: string;
  currentChannel: "telegram" | "app";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const otherChannel = currentChannel === "app" ? "telegram" : "app";

  async function handleSwitch() {
    setLoading(true);
    await fetch("/api/admin/switch-delivery-channel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={handleSwitch}>
      Cambiar a {otherChannel === "app" ? "app (Android)" : "Telegram"}
    </Button>
  );
}

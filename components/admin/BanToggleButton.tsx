"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Manual, account-only ban from the admin user list — intentionally
// simpler than the automated honeypot cascade in lib/security/banCascade.ts,
// which also bans an IP/fingerprint captured from a live request. An admin
// browsing a static user list has no "current" IP/fingerprint for that user
// to act on, so this only ever touches profiles.banned_at. Goes through a
// server route (not a direct client-side update) so a manual suspend also
// notifies the bot/admin-chat, same as an automatic ban already does.
export default function BanToggleButton({
  userId,
  banned,
}: {
  userId: string;
  banned: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    await fetch("/api/admin/toggle-ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, banned }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant={banned ? "outline" : "destructive"}
      disabled={loading}
      onClick={handleToggle}
    >
      {banned ? "Reactivar" : "Suspender"}
    </Button>
  );
}

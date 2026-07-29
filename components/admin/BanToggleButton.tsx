"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

// Manual, account-only ban from the admin user list — intentionally
// simpler than the automated honeypot cascade in lib/security/banCascade.ts,
// which also bans an IP/fingerprint captured from a live request. An admin
// browsing a static user list has no "current" IP/fingerprint for that user
// to act on, so this only ever touches profiles.banned_at.
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
    const supabase = createClient();

    await supabase
      .from("profiles")
      .update({ banned_at: banned ? null : new Date().toISOString() })
      .eq("id", userId);

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

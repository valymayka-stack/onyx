"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

// Clears the one-time device-switch allowance (see
// 0014_delivery_channel_lock.sql / middleware.ts) so a fan blocked at
// /device-switch-blocked can move their access to the new device on their
// next request. Same RLS path as BanToggleButton — profiles_admin_all
// already grants admin full access, no separate API route needed.
export default function ResetDeviceSwitchButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    setLoading(true);
    const supabase = createClient();

    await supabase
      .from("profiles")
      .update({ device_switch_used_at: null })
      .eq("id", userId);

    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={handleReset}>
      Permitir otro cambio de dispositivo
    </Button>
  );
}

"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

export default function LogoutButton() {
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Full navigation so the cleared session cookie is reflected immediately.
    window.location.assign("/login");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout}>
      <LogOut data-icon="inline-start" />
      Cerrar sesión
    </Button>
  );
}

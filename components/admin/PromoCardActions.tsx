"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export default function PromoCardActions({
  id,
  isActive,
  photoPath,
}: {
  id: string;
  isActive: boolean;
  photoPath: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleActive() {
    setLoading(true);
    const supabase = createClient();
    await supabase.from("promo_cards").update({ is_active: !isActive }).eq("id", id);
    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Esto borra la tarjeta para siempre. ¿Continuar?")) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.from("promo_cards").delete().eq("id", id);
    await supabase.storage.from("promo-assets").remove([photoPath]);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={loading} onClick={toggleActive}>
        {isActive ? "Ocultar" : "Activar"}
      </Button>
      <Button size="sm" variant="destructive" disabled={loading} onClick={handleDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export default function HideToggleButton({
  itemId,
  hidden,
}: {
  itemId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("content_items")
      .update(
        hidden
          ? { is_hidden: false, hidden_at: null, hidden_by: null }
          : { is_hidden: true, hidden_at: new Date().toISOString(), hidden_by: user?.id },
      )
      .eq("id", itemId);

    setLoading(false);
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant={hidden ? "outline" : "destructive"}
      disabled={loading}
      onClick={handleToggle}
    >
      {hidden ? "Reactivar" : "Ocultar"}
    </Button>
  );
}

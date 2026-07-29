"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DeleteContentButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Esto borra el archivo y el registro para siempre. ¿Continuar?")) return;

    setLoading(true);
    await fetch(`/api/admin/content/${itemId}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="destructive" disabled={loading} onClick={handleDelete}>
      <Trash2 className="size-4" />
    </Button>
  );
}

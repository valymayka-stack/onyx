"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SetCoverButton({
  collectionId,
  itemId,
}: {
  collectionId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/studio/collections/${collectionId}/cover`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={handleClick}>
      <Star className="size-4" />
    </Button>
  );
}

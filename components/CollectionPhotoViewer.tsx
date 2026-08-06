"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PhotoItem {
  id: string;
  url: string;
  isCover: boolean;
  contentType: "image" | "video";
}

export default function CollectionPhotoViewer({
  items,
}: {
  items: PhotoItem[];
}) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  function goTo(next: number) {
    setIndex(((next % items.length) + items.length) % items.length);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "Escape") setLightboxOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  if (items.length === 0) return null;

  const current = items[index];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-black">
        {current.contentType === "video" ? (
          <video
            key={current.id}
            src={current.url}
            controls
            playsInline
            className="max-h-[70vh] w-full object-contain"
            style={{ WebkitTouchCallout: "none" }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.url}
            alt=""
            className="max-h-[70vh] w-full cursor-zoom-in object-contain"
            draggable={false}
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            onClick={() => setLightboxOpen(true)}
          />
        )}

        {items.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full"
              onClick={() => goTo(index - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
              onClick={() => goTo(index + 1)}
            >
              <ChevronRight />
            </Button>
            <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {index + 1} / {items.length}
            </div>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                goTo(i);
                setLightboxOpen(true);
              }}
              className={cn(
                "size-16 shrink-0 overflow-hidden rounded-lg ring-2 transition-opacity",
                i === index ? "ring-primary" : "ring-transparent opacity-60 hover:opacity-100",
              )}
            >
              {item.contentType === "video" ? (
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                  style={{ WebkitTouchCallout: "none" }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt=""
                  className="size-full object-cover"
                  draggable={false}
                  style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && current.contentType === "image" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <Button
            variant="secondary"
            size="icon-sm"
            className="absolute right-4 top-4 rounded-full"
            onClick={() => setLightboxOpen(false)}
          >
            <X />
          </Button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt=""
            className="max-h-[92vh] max-w-[95vw] cursor-zoom-out object-contain"
            draggable={false}
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            onClick={(e) => e.stopPropagation()}
          />

          {items.length > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon-sm"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(index - 1);
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(index + 1);
                }}
              >
                <ChevronRight />
              </Button>
              <div className="absolute bottom-4 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                {index + 1} / {items.length}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

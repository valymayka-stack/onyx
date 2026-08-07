"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PhotoItem {
  id: string;
  url: string;
  isCover: boolean;
  contentType: "image" | "video";
  caption?: string;
}

const MAX_ZOOM = 4;

function touchDistance(a: React.Touch, b: React.Touch) {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

export default function CollectionPhotoViewer({
  items,
}: {
  items: PhotoItem[];
}) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startTranslate: { x: number; y: number } } | null>(
    null,
  );
  // Pushes a throwaway history entry while the lightbox is open so the
  // phone's own back gesture/button closes the image instead of leaving the
  // whole app — reported by fans as getting "stuck" trying to back out of a
  // photo. Also the single source of truth for closing: closeLightbox()
  // always goes through history.back() when this is true, so there's never
  // a leftover phantom entry the next real back-press has to eat first.
  const historyPushedRef = useRef(false);

  function resetZoom() {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  function goTo(next: number) {
    setIndex(((next % items.length) + items.length) % items.length);
    resetZoom();
  }

  function openLightbox() {
    resetZoom();
    setLightboxOpen(true);
  }

  function closeLightbox() {
    resetZoom();
    if (historyPushedRef.current) {
      historyPushedRef.current = false;
      window.history.back();
    } else {
      setLightboxOpen(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "Escape") closeLightbox();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    window.history.pushState({ onyxLightbox: true }, "");
    historyPushedRef.current = true;
    function onPopState() {
      historyPushedRef.current = false;
      setLightboxOpen(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [lightboxOpen]);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: touchDistance(e.touches[0], e.touches[1]), startScale: scale };
      panRef.current = null;
    } else if (e.touches.length === 1 && scale > 1) {
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTranslate: translate,
      };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = touchDistance(e.touches[0], e.touches[1]);
      const nextScale = Math.min(
        MAX_ZOOM,
        Math.max(1, pinchRef.current.startScale * (dist / pinchRef.current.startDist)),
      );
      setScale(nextScale);
    } else if (e.touches.length === 1 && panRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      setTranslate({ x: panRef.current.startTranslate.x + dx, y: panRef.current.startTranslate.y + dy });
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) {
      panRef.current = null;
      if (scale <= 1.05) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      }
    }
  }

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
            onClick={() => openLightbox()}
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

      {current.caption && (
        <p className="whitespace-pre-wrap text-sm text-foreground">{current.caption}</p>
      )}

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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/95 p-4"
          onClick={() => closeLightbox()}
        >
          {/* Positioned outside the pinch/pan transform below on purpose —
              always reachable regardless of how zoomed in the image is. */}
          <Button
            variant="secondary"
            size="icon-sm"
            className="absolute right-4 top-4 z-10 rounded-full"
            onClick={() => closeLightbox()}
          >
            <X />
          </Button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt=""
            className="max-h-[92vh] max-w-[95vw] object-contain"
            draggable={false}
            style={{
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
              // Disables the browser's own double-tap-to-zoom — that's what
              // was leaving fans stuck mid-zoom with the close button
              // scrolled off-screen. Pinch/pan is handled by our own touch
              // handlers below instead.
              touchAction: "none",
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              cursor: scale > 1 ? "grab" : "zoom-in",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
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

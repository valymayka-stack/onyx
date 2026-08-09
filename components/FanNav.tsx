"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

// "Inicio" and "Grupo" intentionally point to the same route — Grupo's feed
// is the landing page, "Inicio" isn't a separate screen (confirmed with the
// operator). "Colecciones" is the old carousel view, moved to its own route
// so it stays visually untouched. badgeKey ties a link to one of the two
// /api/fan/nav-badges flags — undefined means it never shows a dot.
const LINKS: { href: string; label: string; badgeKey?: "grupo" | "colecciones" }[] = [
  { href: "/feed", label: "Inicio", badgeKey: "grupo" },
  { href: "/feed", label: "Grupo", badgeKey: "grupo" },
  { href: "/feed/colecciones", label: "Colecciones", badgeKey: "colecciones" },
  { href: "/feed/explora", label: "Explora más" },
];

export default function FanNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState<{ grupo: boolean; colecciones: boolean }>({
    grupo: false,
    colecciones: false,
  });

  useEffect(() => {
    fetch("/api/fan/nav-badges")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setBadges({ grupo: !!data.grupo, colecciones: !!data.colecciones });
      })
      .catch(() => {
        // Best-effort — a fan just doesn't see a "new content" dot this load.
      });
  }, []);

  const hasAnyUnseen = badges.grupo || badges.colecciones;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/80 backdrop-blur-sm relative"
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
        {hasAnyUnseen && (
          <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <nav className="relative flex h-full w-64 flex-col gap-1 border-r border-border/60 bg-background p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-heading text-sm font-semibold text-muted-foreground">
                Menú
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú">
                <X className="size-5" />
              </button>
            </div>
            {LINKS.map((link, i) => {
              const active = pathname === link.href;
              const hasUnseen = link.badgeKey ? badges[link.badgeKey] : false;
              return (
                <Link
                  key={`${link.href}-${i}`}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {link.label}
                  {hasUnseen && <span className="size-1.5 rounded-full bg-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}

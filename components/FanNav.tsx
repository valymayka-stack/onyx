"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

// "Inicio" and "Grupo" intentionally point to the same route — Grupo's feed
// is the landing page, "Inicio" isn't a separate screen (confirmed with the
// operator). "Colecciones" is the old carousel view, moved to its own route
// so it stays visually untouched.
const LINKS = [
  { href: "/feed", label: "Inicio" },
  { href: "/feed", label: "Grupo" },
  { href: "/feed/colecciones", label: "Colecciones" },
  { href: "/feed/explora", label: "Explora más" },
];

export default function FanNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/80 backdrop-blur-sm"
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
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
              return (
                <Link
                  key={`${link.href}-${i}`}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}

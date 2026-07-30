"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/security", label: "Seguridad" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/users/new", label: "Crear fan" },
  { href: "/admin/creators/new", label: "Crear creadora" },
  { href: "/admin/collections", label: "Colecciones" },
  { href: "/admin/content", label: "Contenido" },
  { href: "/admin/leaks", label: "Fugas" },
  { href: "/admin/watermark-check", label: "Verificar marca" },
  { href: "/admin/access", label: "Accesos" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

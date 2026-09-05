"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import BanToggleButton from "@/components/admin/BanToggleButton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface UserRow {
  id: string;
  email: string;
  createdAt: string;
  roles: string[];
  displayName: string;
  bannedAt: string | null;
  hasActiveSub: boolean;
  creatorIds: string[];
}

export interface CreatorOption {
  id: string;
  handle: string;
}

// Client-side filter over an already-fetched list — the page now loads
// every account (paginated server-side, not capped at one listUsers page,
// 2026-09-05), so this filters the real full set. The telegram id is the
// email's local part (`<telegramId>@onyx.com`, see provisionFan.ts), so
// filtering by email doubles as filtering by telegram id with no separate
// field needed.
type StatusFilter = "all" | "active" | "suspended";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "suspended", label: "Suspendidas" },
];

export default function UsersTable({ rows, creators }: { rows: UserRow[]; creators: CreatorOption[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [creatorId, setCreatorId] = useState<string>("all");

  const normalized = query.trim().toLowerCase();
  const filtered = rows
    .filter((row) => {
      if (status === "active") return !row.bannedAt;
      if (status === "suspended") return !!row.bannedAt;
      return true;
    })
    // Only fans carry a creator scope — admin/creator accounts always stay
    // visible regardless of which creator is selected, since there's no
    // "mixed up with the wrong business" risk for those, and hiding the
    // one admin account when filtering would just be confusing.
    .filter((row) => {
      if (creatorId === "all" || !row.roles.includes("fan")) return true;
      return row.creatorIds.includes(creatorId);
    })
    .filter(
      (row) =>
        !normalized ||
        row.email.toLowerCase().includes(normalized) ||
        row.displayName.toLowerCase().includes(normalized),
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por Telegram ID, email o nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              status === f.value
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        {creators.length > 0 && (
          <select
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground"
          >
            <option value="all">Todas las creadoras</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.handle}
              </option>
            ))}
          </select>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Suscripción</TableHead>
            <TableHead>Creado</TableHead>
            <TableHead>Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-48 truncate">
                <Link href={`/admin/users/${row.id}`} className="hover:underline">
                  {row.email}
                </Link>
              </TableCell>
              <TableCell>{row.displayName}</TableCell>
              <TableCell>
                {row.roles.map((role) => (
                  <Badge key={role} variant="outline" className="mr-1">
                    {role}
                  </Badge>
                ))}
              </TableCell>
              <TableCell>
                {row.bannedAt ? (
                  <Badge variant="destructive">suspendida</Badge>
                ) : (
                  <Badge variant="secondary">activa</Badge>
                )}
              </TableCell>
              <TableCell>
                {row.roles.includes("fan") ? (
                  row.hasActiveSub ? (
                    <Badge variant="default">suscrito</Badge>
                  ) : (
                    <Badge variant="outline">sin suscripción</Badge>
                  )
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
              <TableCell>
                <BanToggleButton userId={row.id} banned={!!row.bannedAt} />
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                {query ? <>Sin resultados para &ldquo;{query}&rdquo;.</> : "Sin resultados."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

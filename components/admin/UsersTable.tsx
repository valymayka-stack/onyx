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
}

// Client-side filter over an already-fetched list (this page caps at 1000
// users server-side already, so there's no pagination to fight with yet).
// The telegram id is the email's local part (`<telegramId>@onyx.com`, see
// provisionFan.ts), so filtering by email doubles as filtering by telegram
// id with no separate field needed.
export default function UsersTable({ rows }: { rows: UserRow[] }) {
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? rows.filter(
        (row) =>
          row.email.toLowerCase().includes(normalized) ||
          row.displayName.toLowerCase().includes(normalized),
      )
    : rows;

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
                Sin resultados para &ldquo;{query}&rdquo;.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

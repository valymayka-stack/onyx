import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import LogoutButton from "@/components/LogoutButton";

// Reached only via the iPhone gate in middleware.ts — a logged-in fan on an
// iPhone browser lands here instead of the feed. Admins and creators
// (/admin, /studio) are exempted in the middleware and never see this page.
//
// iOS has no capture-prevention API for any web context, so unlike Android
// there's no app that would make this safer than plain Safari already is —
// the 2026-08 call was to route iPhone fans to Telegram instead, where
// delivery already exists independently of this codebase. The automated
// hand-off from here into a specific Telegram invite isn't wired up yet
// (depends on collection <-> bot channel mapping, not built as of this
// page's creation) — for now this is a holding message, not a promise of an
// instant automated delivery.
export default function TelegramAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Tu acceso llega por Telegram</CardTitle>
          <CardDescription>
            En iPhone, el contenido de Onyx se entrega a través de Telegram,
            no desde esta página.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            Si ya compraste una colección, revisa tu chat de Telegram — ahí
            está o llegará tu acceso.
          </p>
          <p>
            Si tienes dudas, contacta al mismo lugar donde hiciste tu compra.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

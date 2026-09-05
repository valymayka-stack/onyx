import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// Reached via Clip's hosted checkout redirect (lib/payments/clipClient.ts
// sets this as success/error/default alike — Clip gives no way to tell
// those apart from the redirect URL itself, confirmed by Taurina's own
// identical Clip integration using the same generic-message approach for
// this same page). Deliberately doesn't claim the payment succeeded: a
// declined or cancelled checkout lands here too, and the real activation
// always happens server-side via the webhook regardless of what this page
// says. Public (see PUBLIC_PREFIXES in middleware.ts) — a fan on Android
// reaches this in the system browser, a separate session from the app's
// own WebView, so this can never assume it has a logged-in Onyx session.
export const dynamic = "force-static";

export default function PagoGraciasPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-xl">Gracias</CardTitle>
          <CardDescription>
            Ya puedes cerrar esta página y regresar a Onyx. En cuanto
            confirmemos tu pago, tu acceso aparece solo, no necesitas hacer
            nada más aquí.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

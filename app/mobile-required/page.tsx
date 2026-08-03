import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import LogoutButton from "@/components/LogoutButton";

// Reached only via the desktop-browser gate in middleware.ts — a logged-in
// fan on a Windows/Mac/Linux browser (no recognized mobile UA token) lands
// here instead of the feed. Admins and creators (/admin, /studio) are
// exempted in the middleware and never see this page.
export default function MobileRequiredPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Onyx solo funciona desde tu celular</CardTitle>
          <CardDescription>
            Por seguridad, el contenido ya no está disponible desde
            computadora.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>Abre este mismo enlace desde tu celular:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              En Android, vas a necesitar la app de Onyx — te la va a pedir
              automáticamente al entrar desde tu celular.
            </li>
            <li>En iPhone, tu acceso se entrega a través de Telegram.</li>
          </ul>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

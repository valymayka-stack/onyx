import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import LogoutButton from "@/components/LogoutButton";

// Reached only via the Android-browser gate in middleware.ts — a logged-in
// fan or creator on a plain Android browser (no OnyxAndroidApp marker in the
// user agent) lands here instead of the feed. Admins and creators (/admin,
// /studio) are exempted in the middleware and never see this page.
export default function AndroidAppRequiredPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Se requiere la app de Onyx</CardTitle>
          <CardDescription>
            Por seguridad, el contenido ya no está disponible desde el
            navegador en Android.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            La app para Android está en desarrollo. En cuanto esté lista te
            avisaremos por el mismo medio donde recibiste el acceso a tu
            cuenta.
          </p>
          <p>
            Mientras tanto, puedes entrar desde una computadora o un iPhone.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

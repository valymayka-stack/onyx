import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import LogoutButton from "@/components/LogoutButton";
import { cn } from "@/lib/utils";

// Reached only via the Android-browser gate in middleware.ts — a logged-in
// fan or creator on a plain Android browser (no OnyxAndroidApp marker in the
// user agent) lands here instead of the feed. Admins and creators (/admin,
// /studio) are exempted in the middleware and never see this page.
//
// The APK itself lives in public/downloads/onyx.apk — there's no build
// pipeline wiring it up automatically, so shipping an app update means
// manually rebuilding it (android-app/ outside this repo) and overwriting
// that file. The signing keystore that update has to be built with lives
// outside this repo entirely (see android-app/keystore/) — losing it means
// every future update needs a new applicationId, since Android won't
// install an update signed with a different key over an existing install.
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
          <a
            href="/downloads/onyx.apk"
            download
            className={cn(buttonVariants({ variant: "default" }), "w-full")}
          >
            Descargar la app de Onyx
          </a>
          <p>
            Al abrir el archivo descargado, Android puede pedirte permitir
            &ldquo;instalar apps de orígenes desconocidos&rdquo; — actívalo
            solo para esta descarga. Es normal: esta app no viene de Play
            Store.
          </p>
          <p>
            Una vez instalada, abre la app e inicia sesión con la misma
            cuenta que ya usas.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

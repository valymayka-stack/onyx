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

// Reached only via the outdated-Android-app gate in middleware.ts —
// isOutdatedAndroidApp() there. Unlike ANDROID_GATE_PATH (a plain Android
// browser, never had the app at all), this fan already has the app open
// right now — it's just an install below ANDROID_MIN_VERSION_CODE, which as
// of 2026-09-05 means every copy in the wild (v1 and v2 both send the same
// unversioned marker — see middleware.ts's comment on ANDROID_MIN_VERSION_CODE).
//
// This page renders inside that same old WebView, which is exactly why the
// download link below can't be trusted to just work: the fan is here at all
// because a WebView bug once silently ate a tap meant to leave the app (see
// MainActivity.kt's shouldOverrideUrlLoading fix) — v1 never got that fix,
// and no old install can ever download a code change into itself. The
// button is same-host (onyx's own domain, not an external redirect), so it
// doesn't hit that specific bug, but nothing here can be verified against a
// real old build (see this session's Android verification notes), so the
// plain-text URL stays as a fallback a fan can type into their phone's own
// browser if tapping the button does nothing.
export default function AppUpdateRequiredPage() {
  const downloadUrl = "/downloads/onyx.apk";
  const fullUrl = "https://onyx-production-fcf0.up.railway.app/downloads/onyx.apk";

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Necesitas actualizar la app</CardTitle>
          <CardDescription>
            Esta versión de la app de Onyx ya no es compatible. Actualízala
            para seguir teniendo acceso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <a
            href={downloadUrl}
            className={cn(buttonVariants({ variant: "default" }), "w-full")}
          >
            Descargar la actualización
          </a>
          <p>
            Al abrir el archivo descargado, Android puede pedirte permitir
            &ldquo;instalar apps de orígenes desconocidos&rdquo; — actívalo
            solo para esta descarga. Es normal: esta app no viene de Play
            Store.
          </p>
          <p>
            Si el botón no hace nada, abre tu navegador (Chrome) fuera de
            esta app y escribe este link:
          </p>
          <p className="break-all rounded bg-muted px-3 py-2 font-mono text-xs">
            {fullUrl}
          </p>
          <p>
            Una vez instalada la actualización, ábrela e inicia sesión con la
            misma cuenta que ya usas.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

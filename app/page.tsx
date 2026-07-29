import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
          <ShieldCheck className="size-7 text-primary" />
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Sandbox Vault
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Tu espacio privado para conectar con tus fans más cercanos.
          Crea una cuenta para entrar, o inicia sesión si ya tienes una.
        </p>
      </div>

      <div className="flex gap-3">
        <Button nativeButton={false} render={<Link href="/signup">Crear cuenta</Link>} />
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/login">Iniciar sesión</Link>}
        />
      </div>
    </main>
  );
}

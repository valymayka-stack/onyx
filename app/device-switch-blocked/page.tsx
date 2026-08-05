import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

// Reached only via middleware.ts's deliveryChannelBlocked redirect — a fan
// who already used their one free device switch (see
// 0014_delivery_channel_lock.sql) tried to switch again. Deliberately
// dead-ends here instead of routing them to whatever gate their current
// device maps to: letting that happen would mean reaching content on a
// channel they're not currently authorized for while the other channel
// (Telegram membership, or the app's grant) is still live.
export default function DeviceSwitchBlockedPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Cambiaste de dispositivo</CardTitle>
          <CardDescription>
            Tu acceso ya está vinculado a otro dispositivo. Para moverlo a
            este, contacta al mismo lugar donde compraste tu acceso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>
            Esto es normal — es un límite de seguridad, no un error de tu
            cuenta.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

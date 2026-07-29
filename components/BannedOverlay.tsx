import { ShieldAlert } from "lucide-react";

// Shared full-screen "account suspended" state — shown by both the honeypot
// button and the DevTools-detection path in ProtectedContentGuard the
// instant the server confirms a ban, without waiting for a navigation.
export default function BannedOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-8 text-center">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <ShieldAlert className="size-10 text-destructive" />
        <h1 className="font-heading text-xl font-semibold">
          Cuenta suspendida
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

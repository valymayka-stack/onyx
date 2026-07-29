"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

function storageKey(collectionId: string) {
  return `collection-consent-${collectionId}`;
}

// A real gate, not just a dismissible dialog: children are never mounted
// until acceptance is recorded, and — since this only ever runs client-side
// — a fresh browser/profile (or cleared storage) sees the notice again. The
// actual enforcement of "unauthorized distribution gets you banned" already
// exists server-side (honeypot + ban cascade); this is the explicit
// heads-up + acknowledgment that makes that policy visible up front.
export default function CollectionConsentGate({
  collectionId,
  children,
}: {
  collectionId: string;
  children: React.ReactNode;
}) {
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Must run post-mount only: localStorage doesn't exist during SSR, so
    // this can't be folded into the initial useState without causing a
    // server/client hydration mismatch (server always renders "not
    // accepted yet" — the only value it can compute safely).
    if (localStorage.getItem(storageKey(collectionId)) === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccepted(true);
    }
  }, [collectionId]);

  function handleAccept() {
    localStorage.setItem(storageKey(collectionId), "1");
    setAccepted(true);
  }

  if (!accepted) {
    return (
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" />
              <DialogTitle>Antes de continuar</DialogTitle>
            </div>
            <DialogDescription>
              Para tu información: por políticas de la página, la descarga o distribución no
              autorizada de este contenido — o cualquier intento de hacerlo — generará un baneo
              permanente de tu cuenta.
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            Entiendo y acepto estas condiciones
          </label>

          <DialogFooter>
            <Button disabled={!checked} onClick={handleAccept}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return <>{children}</>;
}

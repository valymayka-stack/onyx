import { createAdminClient } from "@/lib/supabase/admin";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import TransferReceiptActions from "@/components/admin/TransferReceiptActions";
import { Card, CardContent } from "@/components/ui/card";

const SIGNED_URL_TTL_SECONDS = 300;

export default async function AdminTransferReceiptsPage() {
  const admin = createAdminClient();

  const { data: receipts } = await admin
    .from("manual_transfer_receipts")
    .select(
      "id, amount_cents, receipt_storage_path, submitted_at, profiles(display_name), creators(handle)",
    )
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  const rows = await Promise.all(
    (receipts ?? []).map(async (r) => {
      const { data: signed } = await admin.storage
        .from("payment-receipts")
        .createSignedUrl(r.receipt_storage_path, SIGNED_URL_TTL_SECONDS);
      const fan = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as
        | { display_name: string | null }
        | null;
      const creator = (Array.isArray(r.creators) ? r.creators[0] : r.creators) as
        | { handle: string }
        | null;
      return {
        id: r.id,
        amountCents: r.amount_cents as number,
        submittedAt: r.submitted_at as string,
        fanName: fan?.display_name ?? "Sin nombre",
        creatorHandle: creator?.handle ?? "—",
        imageUrl: signed?.signedUrl ?? null,
      };
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Comprobantes de transferencia" subtitle="Revisa y aprueba pagos manuales por SPEI" />
      <AdminNav />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay comprobantes pendientes de revisión.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.fanName}</span>
                  <span className="text-muted-foreground">@{r.creatorHandle}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  ${(r.amountCents / 100).toFixed(0)} MXN — {new Date(r.submittedAt).toLocaleString("es-MX")}
                </p>
                {r.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt="Comprobante de transferencia"
                    className="max-h-96 w-full rounded-lg border border-border/60 object-contain"
                  />
                )}
                <TransferReceiptActions receiptId={r.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import AdminNav from "@/components/AdminNav";
import PromoCardForm from "@/components/admin/PromoCardForm";
import PromoCardActions from "@/components/admin/PromoCardActions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// "Explora más" — cross-promotion cards shown to fans in the app, each
// linking out to another creator's Telegram bot (see 0018_promo_cards.sql).
export default async function AdminPromoPage() {
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("promo_cards")
    .select("id, photo_path, title, description, link_url, is_active, sort_order")
    .order("sort_order", { ascending: true });

  const nextSortOrder = (cards ?? []).reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <AppHeader title="Explora más" subtitle="Tarjetas de otras modelos mostradas a tus fans" />
      <AdminNav />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tarjetas ({cards?.length ?? 0})
        </h2>
        {cards && cards.length > 0 ? (
          cards.map((card) => {
            const {
              data: { publicUrl },
            } = supabase.storage.from("promo-assets").getPublicUrl(card.photo_path);
            return (
              <Card key={card.id}>
                <CardContent className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicUrl}
                    alt=""
                    className="size-16 shrink-0 rounded-lg object-cover"
                  />
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{card.title}</span>
                      {!card.is_active && <Badge variant="outline">oculta</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{card.link_url}</p>
                  </div>
                  <PromoCardActions
                    id={card.id}
                    isActive={card.is_active}
                    photoPath={card.photo_path}
                  />
                </CardContent>
              </Card>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay tarjetas creadas.</p>
        )}
      </div>

      <PromoCardForm nextSortOrder={nextSortOrder} />
    </main>
  );
}

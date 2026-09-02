import { createAdminClient } from "@/lib/supabase/admin";
import AppHeader from "@/components/AppHeader";
import FanNav from "@/components/FanNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Cross-promotion: cards linking out to other creators' Telegram bots (see
// 0018_promo_cards.sql). Public marketing content, not gated fan content —
// reads through the admin client the same way /feed does for collections,
// but there's no grant/authorization check here since nothing is private.
export default async function ExploraPage() {
  const admin = createAdminClient();

  const { data: cards } = await admin
    .from("promo_cards")
    .select("id, photo_path, title, description, link_url, highlight_until")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);

  // Fire-and-forget, one atomic increment per card actually shown on this
  // load — not awaited, nothing on this page depends on it completing.
  for (const card of cards ?? []) {
    admin.rpc("increment_promo_card_views", { p_card_id: card.id }).then(({ error }) => {
      if (error) console.error("Failed to increment promo card views", error);
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <FanNav />
      <AppHeader title="Explora más" subtitle="Otras modelos que te pueden interesar" />

      {cards && cards.length > 0 ? (
        <section className="flex flex-col gap-4">
          {cards.map((card) => {
            const {
              data: { publicUrl },
            } = admin.storage.from("promo-assets").getPublicUrl(card.photo_path);
            return (
              <Card key={card.id}>
                <CardContent className="flex flex-col gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicUrl}
                    alt=""
                    className="max-h-[50vh] w-full rounded-xl object-cover"
                  />
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="font-[family-name:var(--font-display)] text-2xl italic tracking-tight">
                      {card.title}
                      {card.highlight_until && card.highlight_until >= today && (
                        <span className="text-red-500"> *</span>
                      )}
                    </h3>
                    {card.description && (
                      <p className="max-w-md text-sm text-muted-foreground">{card.description}</p>
                    )}
                  </div>
                  <Button nativeButton={false} render={<a href={card.link_url} target="_blank" rel="noopener noreferrer" />}>
                    Conocer más
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay nada por aquí.</p>
      )}
    </main>
  );
}

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import LogoutButton from "@/components/LogoutButton";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestTelegramInvites, telegramIdFromEmail } from "@/lib/security/telegramBridge";

export const dynamic = "force-dynamic";

// Reached only via the iPhone gate in middleware.ts — a logged-in fan on an
// iPhone browser lands here instead of the feed. Admins and creators
// (/admin, /studio) are exempted in the middleware and never see this page.
//
// iOS has no capture-prevention API for any web context, so unlike Android
// there's no app that would make this safer than plain Safari already is —
// the 2026-08 call was to route iPhone fans to Telegram instead, where
// delivery already exists independently of this codebase.
//
// requestTelegramInvites silently returns false until the bot side of this
// bridge exists (TELEGRAM_BOT_BRIDGE_URL/_SECRET unset) — in that case this
// renders the same generic holding message it always has. Once the bot side
// exists, fans with a mapped collection start seeing the confirmed version
// with no further change needed here.
export default async function TelegramAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const telegramId = telegramIdFromEmail(user?.email);

  // Same reasoning as /feed: collection_access_grants has no fan-select RLS
  // policy, so this goes through the service-role client.
  const admin = createAdminClient();
  let invitesRequested = false;

  if (telegramId) {
    const { data: myGrants } = await admin
      .from("collection_access_grants")
      .select("collection_id")
      .eq("fan_id", user!.id);
    const collectionIds = (myGrants ?? []).map((g) => g.collection_id);

    if (collectionIds.length > 0) {
      const { data: collections } = await admin
        .from("content_collections")
        .select("telegram_channel_code, creators(handle)")
        .in("id", collectionIds)
        .not("telegram_channel_code", "is", null);

      // Grouped by creator handle, not just a flat code list — the bridge is
      // routed per creator (confirmed bug, 2026-08-21: a Lore fan's request
      // silently hit Chivis's bot instead, which told the fan "invite sent"
      // for a channel it doesn't have), so each creator's codes have to go
      // to that creator's own bridge.
      const codesByCreator = new Map<string, string[]>();
      for (const c of collections ?? []) {
        const handle = (c as unknown as { creators: { handle: string } | null }).creators?.handle;
        const code = c.telegram_channel_code;
        if (!handle || !code) continue;
        if (!codesByCreator.has(handle)) codesByCreator.set(handle, []);
        codesByCreator.get(handle)!.push(code);
      }

      for (const [handle, codes] of codesByCreator) {
        const ok = await requestTelegramInvites(telegramId, codes, handle);
        if (ok) invitesRequested = true;
      }
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Tu acceso llega por Telegram</CardTitle>
          <CardDescription>
            En iPhone, el contenido de Onyx se entrega a través de Telegram,
            no desde esta página.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          {invitesRequested ? (
            <p>Ya te mandamos la invitación de tus colecciones por Telegram — revisa tu chat.</p>
          ) : (
            <>
              <p>
                Si ya compraste una colección, revisa tu chat de Telegram — ahí
                está o llegará tu acceso.
              </p>
              <p>
                Si tienes dudas, contacta al mismo lugar donde hiciste tu compra.
              </p>
            </>
          )}
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

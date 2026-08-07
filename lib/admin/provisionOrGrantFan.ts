import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionFanAccount, ProvisionFanError, TELEGRAM_ID_PATTERN } from "@/lib/admin/provisionFan";
import { findFanIdByEmail } from "@/lib/admin/findFanByEmail";

export interface ProvisionOrGrantInput {
  telegramId: string;
  password: string;
  displayName?: string;
  channelCode?: string;
}

export interface ProvisionOrGrantResult {
  userId: string;
  email: string;
  isNewAccount: boolean;
  grantedCollection: { id: string; title: string } | null;
}

// The bot's purchase-approval flow (not wired yet — see
// app/api/bot/provision-fan/route.ts) calls this on every approved
// collection purchase, whether or not the fan already has an Onyx account,
// so the bot never has to track that itself: repeat buyers keep their
// existing credentials and just get the new collection added.
//
// provisionFanAccount itself stays untouched and still throws a hard 409 on
// a duplicate telegramId — /admin/users/new (a human deliberately creating
// one account by hand) should keep getting that clear error instead of this
// silently succeeding.
export async function provisionOrGrantFan({
  telegramId,
  password,
  displayName,
  channelCode,
}: ProvisionOrGrantInput): Promise<ProvisionOrGrantResult> {
  if (!TELEGRAM_ID_PATTERN.test(telegramId)) {
    throw new ProvisionFanError("telegramId inválido (debe ser numérico)", 400);
  }

  const admin = createAdminClient();

  // Validate the channel maps to a real collection *before* touching auth at
  // all. A channelCode that Onyx has no collection for (e.g. Grupo, which
  // deliberately never gets one) must fail with zero side effects — this
  // used to check after creating the account, which left an orphaned,
  // credential-less account behind on every rejected call.
  let collection: { id: string; title: string } | null = null;
  if (channelCode) {
    const { data, error: collectionError } = await admin
      .from("content_collections")
      .select("id, title")
      .eq("telegram_channel_code", channelCode)
      .maybeSingle();

    if (collectionError || !data) {
      throw new ProvisionFanError(
        `No existe ninguna colección con telegram_channel_code="${channelCode}"`,
        404,
      );
    }
    collection = data;
  }

  const email = `${telegramId}@onyx.com`;
  const existingId = await findFanIdByEmail(admin, email);

  let userId: string;
  let isNewAccount: boolean;

  if (existingId) {
    userId = existingId;
    isNewAccount = false;
  } else {
    try {
      const created = await provisionFanAccount({ telegramId, password, displayName });
      userId = created.userId;
      isNewAccount = true;
    } catch (err) {
      // Race: an account was created concurrently between our lookup above
      // and this createUser call — recognize it instead of failing.
      if (err instanceof ProvisionFanError && err.status === 409) {
        const raceId = await findFanIdByEmail(admin, email);
        if (!raceId) {
          throw new ProvisionFanError("No se pudo recuperar la cuenta existente", 500);
        }
        userId = raceId;
        isNewAccount = false;
      } else {
        throw err;
      }
    }
  }

  let grantedCollection: { id: string; title: string } | null = null;
  if (collection) {
    // collection_access_grants has a unique (collection_id, fan_id)
    // constraint (0008_collections.sql) — upsert makes a repeat purchase of
    // the same collection a no-op instead of an error. Explicitly resetting
    // expires_at to null on conflict (rather than ignoreDuplicates) matters
    // for expiring channels: this same call fires on every renewal via
    // notify_onyx_provision, so a fan who renews after their grant expired
    // gets access back automatically, without a separate "un-expire" path.
    const { error: grantError } = await admin
      .from("collection_access_grants")
      .upsert(
        { collection_id: collection.id, fan_id: userId, expires_at: null },
        { onConflict: "collection_id,fan_id" },
      );

    if (grantError) {
      throw new ProvisionFanError("No se pudo otorgar acceso a la colección", 500);
    }

    grantedCollection = collection;
  }

  return { userId, email, isNewAccount, grantedCollection };
}

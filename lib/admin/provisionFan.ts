import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ProvisionFanInput {
  telegramId: string;
  password: string;
  displayName?: string;
}

export interface ProvisionFanResult {
  userId: string;
  email: string;
}

export class ProvisionFanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Telegram user ids are always numeric — this also keeps the synthetic
// `<id>@onyx.com` address well-formed.
const TELEGRAM_ID_PATTERN = /^\d{4,15}$/;

// The only way a fan account gets created now that self-serve signup is
// gone — either the bot route (app/api/bot/provision-fan) right after a
// purchase, or the admin UI (app/(admin)/admin/users/new) for manual cases.
// Both call this so account creation stays in exactly one place.
export async function provisionFanAccount({
  telegramId,
  password,
  displayName,
}: ProvisionFanInput): Promise<ProvisionFanResult> {
  if (!TELEGRAM_ID_PATTERN.test(telegramId)) {
    throw new ProvisionFanError("telegramId inválido (debe ser numérico)", 400);
  }
  if (password.length < 8) {
    throw new ProvisionFanError(
      "La contraseña debe tener al menos 8 caracteres",
      400,
    );
  }

  const email = `${telegramId}@onyx.com`;
  const admin = createAdminClient();

  // email_confirm: true — there's no real inbox at @onyx.com, and
  // "Confirm email" is disabled project-wide anyway, but set it explicitly
  // so this doesn't silently break if that project setting ever changes.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName ?? `Fan ${telegramId}` },
  });

  if (error) {
    const alreadyExists = error.message.toLowerCase().includes("already");
    throw new ProvisionFanError(
      alreadyExists ? "Ya existe una cuenta para ese telegramId" : error.message,
      alreadyExists ? 409 : 500,
    );
  }

  return { userId: data.user!.id, email };
}

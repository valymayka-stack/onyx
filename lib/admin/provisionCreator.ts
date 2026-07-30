import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ProvisionCreatorInput {
  email: string;
  password: string;
  handle: string;
  subjectName: string;
  displayName?: string;
  bio?: string;
}

export interface ProvisionCreatorResult {
  userId: string;
  email: string;
  handle: string;
}

export class ProvisionCreatorError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Handles are used in URLs and shown as @handle — lowercase letters,
// numbers, and dashes only, same shape as a Twitter/Instagram handle.
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The only way a creator account gets created now that self-serve signup is
// gone — admin picks a real email (a creator still needs to log in herself
// at least once, to complete mandatory MFA) and a unique handle. Mirrors
// provisionFan.ts's shape but inserts into public.creators + a 'creator'
// role instead of public.fans + 'fan'.
//
// The consent record is registered here too, admin-attested rather than
// self-served through /studio/consent: the premise (per explicit product
// decision) is that admin only ever adds a creator account *because* consent
// was already obtained through whatever real-world process (contract,
// signed agreement, etc.) — this is that consent's record in the system,
// not the act of obtaining it.
export async function provisionCreatorAccount({
  email,
  password,
  handle,
  subjectName,
  displayName,
  bio,
}: ProvisionCreatorInput): Promise<ProvisionCreatorResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedHandle = handle.trim().toLowerCase();
  const trimmedSubjectName = subjectName.trim();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new ProvisionCreatorError("Correo inválido", 400);
  }
  if (!HANDLE_PATTERN.test(normalizedHandle)) {
    throw new ProvisionCreatorError(
      "Handle inválido (usa minúsculas, números y guiones, 2-30 caracteres)",
      400,
    );
  }
  if (password.length < 8) {
    throw new ProvisionCreatorError(
      "La contraseña debe tener al menos 8 caracteres",
      400,
    );
  }
  if (!trimmedSubjectName) {
    throw new ProvisionCreatorError(
      "El nombre de quien consiente es requerido",
      400,
    );
  }

  const admin = createAdminClient();

  const { data: existingHandle } = await admin
    .from("creators")
    .select("id")
    .eq("handle", normalizedHandle)
    .maybeSingle();
  if (existingHandle) {
    throw new ProvisionCreatorError("Ese handle ya está en uso", 409);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName ?? `@${normalizedHandle}` },
  });

  if (error) {
    const alreadyExists = error.message.toLowerCase().includes("already");
    throw new ProvisionCreatorError(
      alreadyExists ? "Ya existe una cuenta con ese correo" : error.message,
      alreadyExists ? 409 : 500,
    );
  }

  const userId = data.user!.id;

  const { error: creatorError } = await admin.from("creators").insert({
    id: userId,
    handle: normalizedHandle,
    bio: bio?.trim() || null,
  });
  if (creatorError) {
    // Roll back the auth user so a failed second step doesn't leave a
    // dangling account with no creator row and no way to retry cleanly.
    await admin.auth.admin.deleteUser(userId);
    throw new ProvisionCreatorError(creatorError.message, 500);
  }

  const { error: roleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: "creator" });
  if (roleError) {
    throw new ProvisionCreatorError(roleError.message, 500);
  }

  const { error: consentError } = await admin.from("consent_records").insert({
    subject_name: trimmedSubjectName,
    granted_by: userId,
    scope: "sandbox-content-distribution",
    consent_given_at: new Date().toISOString(),
  });
  if (consentError) {
    throw new ProvisionCreatorError(consentError.message, 500);
  }

  return { userId, email: normalizedEmail, handle: normalizedHandle };
}

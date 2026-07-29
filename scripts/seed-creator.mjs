import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: userData, error: userError } =
  await supabase.auth.admin.createUser({
    email: "creator1@sandbox.test",
    password: "correcthorsebattery1",
    email_confirm: true,
    user_metadata: { display_name: "Creadora Demo" },
  });

if (userError) {
  console.error("createUser error", userError);
  process.exit(1);
}

const userId = userData.user.id;
console.log("created auth user", userId);

// The trigger already inserted profiles/fans/user_roles(fan) rows — this
// account needs to be a creator instead, so replace the fan role and add
// the creators row.
const { error: roleError } = await supabase
  .from("user_roles")
  .upsert({ user_id: userId, role: "creator" });
if (roleError) console.error("role upsert error", roleError);

const { error: creatorError } = await supabase.from("creators").upsert({
  id: userId,
  handle: "creadora-demo",
  bio: "Tu rincón privado — contenido exclusivo solo para quienes ya forman parte.",
  monthly_price_cents: 999,
  active: true,
});
if (creatorError) console.error("creators upsert error", creatorError);

const { data: consent, error: consentError } = await supabase
  .from("consent_records")
  .insert({
    subject_name: "Creadora Demo (operador del sandbox)",
    granted_by: userId,
    scope: "sandbox-content-distribution",
    consent_given_at: new Date().toISOString(),
  })
  .select()
  .single();
if (consentError) console.error("consent insert error", consentError);
else console.log("consent record id", consent.id);

console.log("done");

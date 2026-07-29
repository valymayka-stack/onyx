import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function createUser(email, displayName) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "correcthorsebattery1",
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) {
    console.error(`createUser ${email} error`, error);
    process.exit(1);
  }
  console.log(`created ${email}`, data.user.id);
  return data.user.id;
}

// fan1 — stays a plain fan, trigger already gave it the fan role/row.
await createUser("fan1@sandbox.test", "Fan Demo");

// admin1 — created as a fan by the trigger, then promoted to admin-only.
const adminId = await createUser("admin1@sandbox.test", "Admin Demo");
await supabase.from("user_roles").delete().eq("user_id", adminId).eq("role", "fan");
await supabase.from("fans").delete().eq("id", adminId);
await supabase.from("user_roles").upsert({ user_id: adminId, role: "admin" });
console.log("admin1: now admin-only");

console.log("done");

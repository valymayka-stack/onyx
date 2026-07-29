import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CREATOR_ID = "163dd4ec-a27c-4a9c-b68d-5af5a62ada4a"; // creator1@sandbox.test
const FAN_ID = "7ce350a3-5fdb-48c7-b1f2-7f717fdc7c09"; // fan1@sandbox.test

// --- 1. creator1: strip the accidental 'fan' role + fans row ---
await supabase.from("user_roles").delete().eq("user_id", CREATOR_ID).eq("role", "fan");
await supabase.from("fans").delete().eq("id", CREATOR_ID);
console.log("creator1: now creator-only");

// --- 2. fan1: strip the 'admin' role added for earlier testing ---
await supabase.from("user_roles").delete().eq("user_id", FAN_ID).eq("role", "admin");
console.log("fan1: now fan-only");

// --- 3. dedicated admin-only account ---
const { data: existingAdmin } = await supabase.auth.admin.listUsers();
let adminUser = existingAdmin.users.find((u) => u.email === "admin1@sandbox.test");

if (!adminUser) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: "admin1@sandbox.test",
    password: "correcthorsebattery1",
    email_confirm: true,
    user_metadata: { display_name: "Admin Demo" },
  });
  if (error) {
    console.error("createUser error", error);
    process.exit(1);
  }
  adminUser = created.user;
  console.log("created admin1 auth user", adminUser.id);
}

const ADMIN_ID = adminUser.id;
await supabase.from("user_roles").delete().eq("user_id", ADMIN_ID).eq("role", "fan");
await supabase.from("fans").delete().eq("id", ADMIN_ID);
await supabase.from("user_roles").upsert({ user_id: ADMIN_ID, role: "admin" });
console.log("admin1: now admin-only");

console.log("done");

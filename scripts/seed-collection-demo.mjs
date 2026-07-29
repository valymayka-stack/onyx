import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: usersPage } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
const creator = usersPage.users.find((u) => u.email === "creator1@sandbox.test");
const honestFan = usersPage.users.find((u) => u.email === "fan1@sandbox.test");
if (!creator || !honestFan) {
  console.error("run scripts/seed-creator.mjs and scripts/reseed-basic-accounts.mjs first");
  process.exit(1);
}

let attacker = usersPage.users.find((u) => u.email === "fan-attacker@sandbox.test");
if (!attacker) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: "fan-attacker@sandbox.test",
    password: "correcthorsebattery1",
    email_confirm: true,
    user_metadata: { display_name: "Fan Atacante" },
  });
  if (error) {
    console.error("createUser fan-attacker error", error);
    process.exit(1);
  }
  attacker = data.user;
}
console.log("creator1", creator.id);
console.log("honest fan (fan1)", honestFan.id);
console.log("attacker fan", attacker.id);

const { data: consent } = await supabase
  .from("consent_records")
  .select("id")
  .eq("granted_by", creator.id)
  .is("revoked_at", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (!consent) {
  console.error("no consent record for creator1 — run scripts/seed-creator.mjs first");
  process.exit(1);
}

const { data: newCollection, error: collectionError } = await supabase
  .from("content_collections")
  .insert({
    creator_id: creator.id,
    title: "Set privado de playa",
    description: "Colección de prueba — solo visible para quien tenga acceso concedido.",
    price_cents: 1500,
  })
  .select("id")
  .single();
if (collectionError || !newCollection) {
  console.error("collection insert error", collectionError);
  process.exit(1);
}
const collectionId = newCollection.id;
console.log("collection", collectionId);

async function makeSyntheticJpeg(color, label) {
  const svg = `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="800" fill="${color}" />
    <text x="400" y="420" font-size="48" fill="white" text-anchor="middle" font-family="sans-serif">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

const photos = [
  { color: "#7c3aed", label: "Portada", isCover: true },
  { color: "#2563eb", label: "Foto 1", isCover: false },
  { color: "#059669", label: "Foto 2", isCover: false },
  { color: "#dc2626", label: "Foto 3", isCover: false },
];

let coverItemId = null;
for (const photo of photos) {
  const buffer = await makeSyntheticJpeg(photo.color, photo.label);
  const path = `${creator.id}/collections/${collectionId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("content-raw")
    .upload(path, buffer, { contentType: "image/jpeg" });
  if (uploadError) {
    console.error("upload error", uploadError);
    process.exit(1);
  }

  const { data: item, error: insertError } = await supabase
    .from("content_items")
    .insert({
      creator_id: creator.id,
      storage_path: path,
      content_type: "image",
      is_premium: true,
      collection_id: collectionId,
      is_cover: photo.isCover,
      consent_record_id: consent.id,
    })
    .select("id")
    .single();
  if (insertError || !item) {
    console.error("content_items insert error", insertError);
    process.exit(1);
  }
  if (photo.isCover) coverItemId = item.id;
  console.log(`  uploaded ${photo.label}${photo.isCover ? " (cover)" : ""} -> item ${item.id}`);
}

await supabase.from("content_collections").update({ cover_item_id: coverItemId }).eq("id", collectionId);

// The actual privacy enforcement: only the honest fan gets a grant. The
// attacker fan exists and is a real registered user, but deliberately never
// appears in this table — that's the thing this demo is meant to prove.
const { error: grantError } = await supabase
  .from("collection_access_grants")
  .upsert(
    { collection_id: collectionId, fan_id: honestFan.id, granted_by: creator.id },
    { onConflict: "collection_id,fan_id" },
  );
if (grantError) {
  console.error("grant error", grantError);
  process.exit(1);
}
console.log("granted access to fan1 (honest) only — fan-attacker was NOT granted");

console.log("done");

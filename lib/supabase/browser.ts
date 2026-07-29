import { createBrowserClient } from "@supabase/ssr";

// Client Component client — anon key only, RLS-scoped.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

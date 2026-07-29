import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { runScan } from "@/lib/leakwatch/scan";

// Manually triggered from /admin/leaks for now. In production this is what a
// real cron (Vercel Cron / Railway cron) would hit on a schedule instead of
// relying on someone clicking a button.
export async function POST() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const results = await runScan(admin);

  return NextResponse.json({ results });
}

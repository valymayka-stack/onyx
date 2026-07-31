import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { runScan } from "@/lib/leakwatch/scan";

// Constant-time compare — see the same helper in
// app/api/bot/provision-fan/route.ts for why a plain `===` isn't safe here.
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Two ways in: an authenticated admin clicking the button in /admin/leaks
// (unchanged), or the scheduled Railway cron service hitting this on a
// timer with a shared secret — the cron has no browser session of its own,
// same reasoning as the bot-provisioning route's x-bot-secret.
function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.LEAK_SCAN_CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  return !!secret && !!provided && secretsMatch(provided, secret);
}

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  const results = await runScan(admin);

  return NextResponse.json({ results });
}

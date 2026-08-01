import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { pruneOldSecurityData } from "@/lib/security/dataRetention";

// Constant-time compare — see the same helper in
// app/api/bot/provision-fan/route.ts for why a plain `===` isn't safe here.
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Own secret, separate from LEAK_SCAN_CRON_SECRET: that one only reads
// external sites and inserts findings, so a leaked copy of it is low
// consequence. This one deletes rows — keeping it separate means a
// compromised leak-scan secret can't also be used to purge security data.
function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.DATA_RETENTION_CRON_SECRET;
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
  const result = await pruneOldSecurityData(admin);

  return NextResponse.json(result);
}

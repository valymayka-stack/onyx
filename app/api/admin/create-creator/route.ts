import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth/roles";
import { provisionCreatorAccount, ProvisionCreatorError } from "@/lib/admin/provisionCreator";

// Admin-only — creator accounts aren't self-serve and (unlike fans) aren't
// bot-provisioned either, so this is the only path that creates one.
export async function POST(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || !(await hasRole(sessionClient, user.id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const handle = typeof body?.handle === "string" ? body.handle : "";
  const displayName =
    typeof body?.displayName === "string" ? body.displayName : undefined;
  const bio = typeof body?.bio === "string" ? body.bio : undefined;

  if (!email || !password || !handle) {
    return NextResponse.json(
      { error: "email, password y handle son requeridos" },
      { status: 400 },
    );
  }

  try {
    const result = await provisionCreatorAccount({
      email,
      password,
      handle,
      displayName,
      bio,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ProvisionCreatorError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "No se pudo crear la cuenta" },
      { status: 500 },
    );
  }
}

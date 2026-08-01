import { NextResponse } from "next/server";

// Deliberately does nothing but respond — no DB call, no auth check. The
// point is to answer "is the Next.js process itself still accepting and
// completing requests", not "is Supabase reachable". Railway hits this on a
// schedule and restarts the service if it stops responding — the missing
// piece after the two event-loop-blocking outages this session: those were
// hangs, not crashes, and a hang doesn't get auto-restarted without an HTTP
// health check to catch it.
export async function GET() {
  return NextResponse.json({ ok: true });
}

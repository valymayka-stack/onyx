import type { NextRequest } from "next/server";

// Local dev / same-machine testing has no real forwarded-for chain, so fall
// back to a loopback marker rather than null — every check downstream treats
// "unknown" as its own bucket instead of silently matching every request.
export function getRequestIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "127.0.0.1";
}

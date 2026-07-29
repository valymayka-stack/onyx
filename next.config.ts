import type { NextConfig } from "next";

// The Supabase browser client (lib/supabase/browser.ts) talks to Supabase
// directly from client-side JS, so connect-src has to name that origin
// explicitly — it isn't same-origin with the Next.js app, in dev or once
// deployed against Supabase Cloud.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js's own hydration/RSC bootstrap scripts are inline; no nonce
  // wiring here yet, so 'unsafe-inline' is accepted for scripts specifically.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${supabaseUrl}`,
  "font-src 'self'",
  // The whole point of the gated content viewer is that it can't be
  // reframed on someone else's page — this is the CSP-level version of the
  // X-Frame-Options header below.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Only takes effect over HTTPS (browsers ignore it on plain HTTP), so it's
  // a no-op locally and active once deployed.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

// Next.js server-startup hook (stable since Next 15, no experimental flag
// needed). Runs once when the server process boots.
//
// This gives "some" constant monitoring without external infra: a
// setInterval that keeps re-scanning known leak-watch targets for as long as
// the dev/prod server process stays up. It is NOT a substitute for a real
// cron once this is deployed — document that clearly rather than pretend
// this is production-grade scheduling. In production, replace this with a
// Vercel Cron / Railway cron hitting POST /api/admin/leak-watch/scan on a
// schedule, and delete this file.

declare global {
  var __leakWatchIntervalStarted: boolean | undefined;
}

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FIRST_RUN_DELAY_MS = 30_000; // let the server finish booting first

export async function register() {
  // instrumentation register() runs for both the Node.js and Edge runtimes —
  // fetch()-based scraping and the service-role Supabase client only make
  // sense in the Node.js runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guard against duplicate intervals if this module gets re-evaluated
  // (e.g. dev-mode hot reload) within the same process.
  if (globalThis.__leakWatchIntervalStarted) return;
  globalThis.__leakWatchIntervalStarted = true;

  async function tick() {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { runScan } = await import("@/lib/leakwatch/scan");

      const admin = createAdminClient();
      const results = await runScan(admin);
      const totalNew = results.reduce((sum, r) => sum + r.newFindings, 0);
      const blocked = results.filter((r) => r.blocked).map((r) => r.siteLabel);

      console.log(
        `[leak-watch] scan complete: ${results.length} objetivos, ${totalNew} hallazgos nuevos` +
          (blocked.length ? `, bloqueados: ${blocked.join(", ")}` : ""),
      );
    } catch (err) {
      console.error("[leak-watch] scan failed", err);
    }
  }

  setTimeout(tick, FIRST_RUN_DELAY_MS);
  setInterval(tick, SCAN_INTERVAL_MS);
}

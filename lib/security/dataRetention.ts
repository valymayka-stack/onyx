import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Both tables below are append-only, one row per event/attempt, with no
// existing cleanup — see git history for why that's a real problem at scale
// (unbounded growth, forever). Retention windows here are generous relative
// to what each table is actually used for:
//
// - action_attempts only ever gets queried over a short rolling window (see
//   lib/security/rateLimiter.ts — every caller passes windowMinutes in the
//   single digits to low tens), so anything older than a day has zero
//   remaining purpose.
// - security_events is operational telemetry for the admin security panel,
//   not the permanent record — an account's ban itself is recorded
//   separately and permanently in ban_history (never pruned), so trimming
//   this after 90 days doesn't lose the thing that actually matters long
//   term, just the day-to-day signal noise leading up to it.
//
// content_delivery_marks is deliberately NOT pruned here: it's the forensic
// trail that makes the invisible watermark traceable back to a specific
// delivery, which is only useful for as long as it's kept — a leak can
// surface months after the fact. Revisit with an explicit retention
// decision (not a default) if storage cost there becomes a real problem.
const ACTION_ATTEMPTS_RETENTION_HOURS = 48;
const SECURITY_EVENTS_RETENTION_DAYS = 90;

export interface RetentionResult {
  actionAttemptsDeleted: number;
  securityEventsDeleted: number;
}

export async function pruneOldSecurityData(
  admin: SupabaseClient,
): Promise<RetentionResult> {
  const actionAttemptsCutoff = new Date(
    Date.now() - ACTION_ATTEMPTS_RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const securityEventsCutoff = new Date(
    Date.now() - SECURITY_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: deletedAttempts } = await admin
    .from("action_attempts")
    .delete()
    .lt("created_at", actionAttemptsCutoff)
    .select("id");

  const { data: deletedEvents } = await admin
    .from("security_events")
    .delete()
    .lt("created_at", securityEventsCutoff)
    .select("id");

  return {
    actionAttemptsDeleted: deletedAttempts?.length ?? 0,
    securityEventsDeleted: deletedEvents?.length ?? 0,
  };
}

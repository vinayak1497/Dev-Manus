/**
 * Consecutive genuine external failures.
 *
 * Phase 1 alerted on the FIRST unhealthy observation. Onboarding has always
 * stored a `failureThreshold` ("Failures to alert: N"), displayed it on the
 * dashboard, and never applied it. Phase 2 applies it — but without inventing
 * a second source of truth for "how many times in a row has this failed?".
 *
 * The streak is DERIVED from the observations that already exist:
 *
 *   service_health_checks
 *     where source = 'external' and is_demo = false
 *     order by checked_at desc
 *
 * Deriving rather than storing is deliberate (see the migration header):
 *
 * - It cannot drift from the observations it summarises. A stored counter is
 *   a second fact that has to be kept in step with the first, and the two
 *   disagree the moment a write is retried.
 * - "Recorded exactly once" and "counted exactly once" become the same fact.
 *   A retried insert that fails is counted zero times; there is no window in
 *   which an observation exists but the counter moved twice.
 * - It survives a worker restart for free — it is not process state.
 * - Demo, synthetic, simulation and `monitor probe` rows are excluded by
 *   `source`/`is_demo`, so a demo scenario can never push a real project
 *   towards (or away from) an incident.
 *
 * The `monitor probe` self-copy rows written by `runMonitorTick` are skipped
 * rather than counted, which is exactly what stops one real failure from being
 * counted twice just because the detector ticked again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceStatus } from "../incidents";
import { isHealthyStatus, isUnhealthyStatus } from "../detection/reconcile";

/** The only source that represents a genuine, user-configured check. */
export const EXTERNAL_SOURCE = "external";

export type ExternalObservationRow = {
  status: string;
  source: string;
  is_demo: boolean | null;
};

/** True when this row is a real, non-demo observation of the configured target. */
export function isGenuineExternalObservation(row: ExternalObservationRow): boolean {
  return row.source === EXTERNAL_SOURCE && row.is_demo !== true;
}

/**
 * Count consecutive genuine failed observations, newest first.
 *
 * Stops at the first genuine healthy observation (the streak is broken), at
 * the first genuine reading that is neither healthy nor unhealthy (an honest
 * "we cannot tell" never advances the count either way), or once `threshold`
 * failures have been seen — the caller never needs a larger number than the
 * one it compares against.
 *
 * Non-genuine rows are skipped without breaking the streak: they are not
 * evidence about the configured endpoint.
 */
export function countConsecutiveExternalFailures(
  rows: readonly ExternalObservationRow[],
  threshold: number,
): number {
  const limit = Math.max(1, Math.trunc(threshold) || 1);
  let failures = 0;
  for (const row of rows) {
    if (!isGenuineExternalObservation(row)) continue;
    const status = row.status as ServiceStatus;
    if (isHealthyStatus(status)) break;
    if (!isUnhealthyStatus(status)) break;
    failures += 1;
    if (failures >= limit) break;
  }
  return failures;
}

export type ExternalFailureStreak = {
  consecutiveFailures: number;
  /** When the newest genuine external observation was recorded, if any. */
  lastCheckedAt: string | null;
  /** Status of the newest genuine external observation, if any. */
  lastStatus: ServiceStatus | null;
};

/**
 * Read the genuine external streak for one service, straight from the
 * persisted observations. `limit` bounds the scan to exactly as many rows as
 * the threshold can need, so this stays cheap on the `(service_id,
 * checked_at desc)` index regardless of how many checks exist.
 */
export async function readExternalFailureStreak(
  supabase: SupabaseClient,
  serviceId: string,
  threshold: number,
): Promise<ExternalFailureStreak> {
  const limit = Math.max(1, Math.trunc(threshold) || 1);
  const { data, error } = await supabase
    .from("service_health_checks")
    .select("status, source, is_demo, checked_at")
    .eq("service_id", serviceId)
    .eq("source", EXTERNAL_SOURCE)
    .eq("is_demo", false)
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) {
    // Never invent a streak from an unreadable history. Zero failures is the
    // honest "we have no evidence of consecutive failures" answer, and it can
    // only delay an alert, never fabricate one.
    return { consecutiveFailures: 0, lastCheckedAt: null, lastStatus: null };
  }
  const rows = (data ?? []) as (ExternalObservationRow & { checked_at?: string })[];
  return {
    consecutiveFailures: countConsecutiveExternalFailures(rows, limit),
    lastCheckedAt: rows[0]?.checked_at ?? null,
    lastStatus: (rows[0]?.status as ServiceStatus | undefined) ?? null,
  };
}
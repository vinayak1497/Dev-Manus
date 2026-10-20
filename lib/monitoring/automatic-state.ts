/**
 * What the dashboard is allowed to claim about automatic monitoring.
 *
 * This is a deliberately narrow, read-only view assembled from the SAME rows
 * the worker writes. Two rules shape it:
 *
 * 1. It never claims the worker is running. There is no heartbeat table, and
 *    a configuration flag is not evidence of a live process (RULE.md 9.1).
 *    "Stale" is derived from the real scheduling columns instead: a service
 *    whose next-due time has passed and whose last real check has not advanced
 *    means checks have stopped — whether the worker died, was never started,
 *    or the database is unreachable.
 *
 * 2. Every read degrades to `null`, never to a fabricated value. A database
 *    that has not had the Phase 2 migration applied reports an undefined
 *    column (PostgREST `42703`); reading that as "monitoring is off" would be
 *    a lie, and adding the columns to the dashboard's main `services` select
 *    would break that whole card for anyone who has not migrated yet. So the
 *    automatic-monitoring read is isolated here and failure is silent and
 *    honest.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceStatus } from "../incidents";
import { readExternalFailureStreak } from "./failure-streak";
import { MONITORED_SERVICE_NAME } from "./external-check";
import { hasRunnableHttpConfig, readFailureThreshold } from "./health-settings";
import {
  observationMatchesHealth,
  type ObservationMetadata,
} from "./observation-match";
import { readAutomaticMonitoringEnabled, readProjectConfig } from "../project-config-read";

export type AutomaticMonitoringState = {
  /** Onboarding stored something the HTTP checker could run. */
  configured: boolean;
  /** Operator switch. `null` = unknown (migration not applied, unreadable). */
  enabled: boolean | null;
  serviceId: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastStatus: ServiceStatus | null;
  lastStatusCode: number | null;
  lastDetail: string | null;
  lastError: string | null;
  consecutiveFailures: number | null;
  failureThreshold: number | null;
  intervalSec: number | null;
};

export type AutomaticMonitoringView = AutomaticMonitoringState & {
  /** True when a check was due and the recorded next check is now overdue. */
  stale: boolean;
};

const EMPTY: AutomaticMonitoringState = {
  configured: false,
  enabled: null,
  serviceId: null,
  lastCheckedAt: null,
  nextCheckAt: null,
  lastStatus: null,
  lastStatusCode: null,
  lastDetail: null,
  lastError: null,
  consecutiveFailures: null,
  failureThreshold: null,
  intervalSec: null,
};

/**
 * Has the schedule stopped making progress?
 *
 * Pure so the "honest staleness" rule is unit-tested rather than eyeballed:
 * a service is stale when its recorded next-due time has passed and no newer
 * check has arrived, with a grace period wide enough to absorb one poll
 * interval of jitter and a normal error backoff.
 *
 * No due time at all is NOT stale — a project that has never been checked has
 * simply never been checked, and saying "checks have stopped" would be a
 * different (and unsupported) claim.
 */
export function isMonitoringStale(
  nextCheckAt: string | null,
  intervalSec: number | null,
  now: number,
): boolean {
  if (!nextCheckAt) return false;
  const due = Date.parse(nextCheckAt);
  if (!Number.isFinite(due)) return false;
  const graceMs = Math.max((intervalSec ?? 30) * 1000, 60_000);
  return now > due + graceMs;
}

/**
 * Assemble the dashboard's view of automatic monitoring for one project.
 *
 * Never throws: a monitoring card is not worth taking the dashboard down for.
 */
export async function readAutomaticMonitoringState(
  supabase: SupabaseClient,
  projectId: string,
  now: number = Date.now(),
): Promise<AutomaticMonitoringView> {
  const [{ config }, enabled] = await Promise.all([
    readProjectConfig(supabase, projectId),
    readAutomaticMonitoringEnabled(supabase, projectId),
  ]);

  const health = config?.health ?? null;
  const state: AutomaticMonitoringState = {
    ...EMPTY,
    configured: hasRunnableHttpConfig(health),
    enabled,
    failureThreshold: health ? readFailureThreshold(health) : null,
    intervalSec: health ? Number(health.intervalSec ?? "") || null : null,
  };
  if (!state.configured) return { ...state, stale: false };

  const { data: service } = await supabase
    .from("services")
    .select(
      "id, monitoring_last_check_at, monitoring_next_check_at, monitoring_last_status, monitoring_last_error",
    )
    .eq("project_id", projectId)
    .eq("name", MONITORED_SERVICE_NAME)
    .eq("is_demo", false)
    .maybeSingle();

  if (service) {
    const row = service as Record<string, unknown>;
    state.serviceId = typeof row.id === "string" ? row.id : null;
    state.lastCheckedAt =
      typeof row.monitoring_last_check_at === "string" ? row.monitoring_last_check_at : null;
    state.nextCheckAt =
      typeof row.monitoring_next_check_at === "string" ? row.monitoring_next_check_at : null;
    state.lastError =
      typeof row.monitoring_last_error === "string" ? row.monitoring_last_error : null;
    state.lastStatus =
      typeof row.monitoring_last_status === "string"
        ? (row.monitoring_last_status as ServiceStatus)
        : null;
  }

  if (state.serviceId) {
    // The newest genuine external observation. It is only surfaced when it
    // actually describes the configuration saved now: after an endpoint or
    // expected-status change, the previous target's result is history, not
    // evidence about the new target (see observation-match.ts).
    const { data: latest } = await supabase
      .from("service_health_checks")
      .select("metadata, detail")
      .eq("service_id", state.serviceId)
      .eq("source", "external")
      .eq("is_demo", false)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const metadata =
      (latest as { metadata?: ObservationMetadata } | null)?.metadata ?? null;
    if (latest && observationMatchesHealth(metadata, health)) {
      const code = (metadata as { status_code?: unknown } | null)?.status_code;
      if (typeof code === "number") state.lastStatusCode = code;
      const detail = (latest as { detail?: unknown }).detail;
      if (typeof detail === "string") state.lastDetail = detail;

      const streak = await readExternalFailureStreak(
        supabase,
        state.serviceId,
        state.failureThreshold ?? 1,
      );
      if (streak.lastCheckedAt !== null) {
        state.consecutiveFailures = streak.consecutiveFailures;
      }
    }
  }

  // Stale == the scheduler recorded a due time that has passed without the
  // service being checked again.
  const stale = isMonitoringStale(state.nextCheckAt, state.intervalSec, now);

  return { ...state, stale };
}
/**
 * One genuine external HTTP health check — the production execution path.
 *
 * This module is the single implementation of "run the configured check and
 * record what actually happened". It is called from two places:
 *
 *   1. `app/projects/[id]/health-actions.ts` — the signed-in "Run HTTP check"
 *      button (Phase 1), and
 *   2. `lib/monitoring/scheduler.ts` — the unattended worker loop (Phase 2).
 *
 * Before Phase 2 that logic lived only inside the server action, which
 * imports `next/cache` and the cookie-scoped Supabase client, so a worker
 * could not have called it without importing Next.js-only modules into a
 * plain Node process. Extracting it here — rather than writing a second probe
 * for the worker — is what keeps OBSERVE genuine and the two entry points
 * provably identical (RULE.md: "do not create a second monitoring
 * implementation").
 *
 * Everything downstream of "an observation exists" is the EXISTING Phase 1
 * pipeline and is untouched: `buildExternalObservation` composes the row,
 * `runMonitorTick` reconciles it, `reconcileService` decides. This module
 * only removes the Next.js coupling, nothing else.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runMonitorTick } from "../detection/monitor";
import { buildHealthCheckUrl } from "../onboarding/health";
import { readProjectConfig } from "../project-config-read";
import {
  buildExternalObservation,
  classifyHttpStatus,
  classifyNoResponse,
  isBlockedAddress,
  isBlockedHostname,
  type HttpCheckClassification,
} from "./http-check";
import { readExpectedStatus, readTimeoutSec } from "./health-settings";

/**
 * The one canonical service per project for the configured check. Matches the
 * unique `(project_id, name)` key, so repeated runs — manual or automatic —
 * always reuse the same row.
 */
export const MONITORED_SERVICE_NAME = "Application endpoint";
export const MONITORED_SERVICE_KIND = "http-endpoint";

/**
 * Resolve a monitoring target's host and refuse anything internal.
 *
 * Two independent gates, unchanged from Phase 1:
 * - structurally internal names (localhost, *.internal, *.local, …) are
 *   refused with no DNS lookup at all;
 * - after resolution EVERY address must be public, so a public name that
 *   points at a private address is refused too.
 *
 * Returns `null` when the target is acceptable, or an operator-facing reason
 * when it is not. Never throws.
 */
export async function resolvePublicHost(hostname: string): Promise<string | null> {
  if (isBlockedHostname(hostname)) return `Refusing to check internal target "${hostname}".`;
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    return `Monitoring target "${hostname}" does not resolve.`;
  }
  if (records.length === 0) return `Monitoring target "${hostname}" does not resolve.`;
  for (const record of records) {
    if (isIP(record.address) === 0 || isBlockedAddress(record.address)) {
      return `Refusing to check non-public target "${hostname}".`;
    }
  }
  return null;
}

export type MonitoredServiceRow = {
  id: string;
  description: string;
  created: boolean;
};

/**
 * Find or create the canonical monitored service for a project.
 *
 * Idempotent on `(project_id, name)`. The description always names the URL
 * actually checked, so the row is an audit trail rather than a mirror that
 * can silently drift from the configuration.
 *
 * Shared by the manual action and the scheduler so both resolve the same
 * service identity — two implementations here would be the classic way to
 * end up reconciling one service while checking another.
 */
export async function ensureMonitoredService(
  supabase: SupabaseClient,
  projectId: string,
  checkedUrl: string,
): Promise<MonitoredServiceRow | { error: string }> {
  const description = `Configured HTTP check: ${checkedUrl}`;
  const { data: existing } = await supabase
    .from("services")
    .select("id, description")
    .eq("project_id", projectId)
    .eq("name", MONITORED_SERVICE_NAME)
    .maybeSingle();
  if (existing) {
    const id = existing.id as string;
    if ((existing as { description?: unknown }).description !== description) {
      await supabase.from("services").update({ description }).eq("id", id);
    }
    return { id, description, created: false };
  }
  const { data: created, error } = await supabase
    .from("services")
    .insert({
      project_id: projectId,
      name: MONITORED_SERVICE_NAME,
      kind: MONITORED_SERVICE_KIND,
      status: null,
      description,
      is_demo: false,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { error: "Couldn't set up the monitoring target service." };
  }
  return { id: created.id as string, description, created: true };
}

export type ExternalCheckResult = {
  ok: boolean;
  /** Operator-facing reason the check could not run or could not be recorded. */
  error?: string;
  /** True when a real observation was persisted for this run. */
  observed: boolean;
  checkedUrl?: string;
  /** The URL actually probed — identical to what the dashboard displays. */
  statusCode?: number | null;
  status?: HttpCheckClassification["status"];
  latencyMs?: number;
  /**
   * When the OBSERVATION was taken. This — never the scheduler's poll
   * timestamp — is what the next due time is computed from, so a slow or
   * delayed poll can never distort the configured cadence.
   */
  checkedAt?: string;
  serviceId?: string;
  createdIncidents: number;
  resolvedIncidents: number;
  tickOk: boolean;
};

export type RunExternalCheckOptions = {
  supabase: SupabaseClient;
  projectId: string;
  /**
   * Reuse an already-resolved service row. The scheduler resolves it before
   * claiming the work, so a claimed-but-abandoned check never re-creates rows.
   */
  serviceId?: string;
  /**
   * Identity of this execution. It is written as the observation's primary
   * key, so re-running the write after a transient failure is a no-op instead
   * of a duplicate observation.
   */
  observationId?: string;
  /**
   * Recorded as the incident's `created_by`. `null` for unattended worker
   * runs, which is exactly what "detected by the system" should look like.
   */
  userId?: string | null;
};

/**
 * Run the project's configured HTTP check once and record the observation.
 *
 * OBSERVE → DETECT, never BUTTON → INCIDENT: this performs the request,
 * persists the genuine observation, and then runs one detection pass. The
 * detector — not this function — decides whether an incident opens, is
 * deduplicated, verifies, or resolves.
 *
 * Returns an honest result in every case:
 * - refused/invalid configuration, or an unreachable/blocked target: `ok:false`
 *   with a reason and **no observation row** (a check that never ran is not
 *   evidence, RULE.md 9.1);
 * - a real 4xx/5xx/timeout/connection failure: `ok:true`, `observed:true`,
 *   with the genuine critical observation persisted;
 * - a failed write: `ok:false` with an explicit persistence error. The caller
 *   must never treat a failed write as a healthy result.
 */
export async function runConfiguredHttpCheckCore(
  options: RunExternalCheckOptions,
): Promise<ExternalCheckResult> {
  const { supabase, projectId } = options;
  const empty: ExternalCheckResult = {
    ok: false,
    observed: false,
    createdIncidents: 0,
    resolvedIncidents: 0,
    tickOk: false,
  };

  const { config } = await readProjectConfig(supabase, projectId);
  const health = config?.health;
  if (!health || health.method !== "http") {
    return {
      ...empty,
      error:
        "This project has no HTTP health check configured. Set a target URL and endpoint path in onboarding first.",
    };
  }
  const built = buildHealthCheckUrl(health.targetUrl ?? "", health.endpoint ?? "");
  if (built.error || !built.url) {
    return {
      ...empty,
      error: built.error ?? "The stored health check target is incomplete.",
    };
  }
  const expected = readExpectedStatus(health);
  if (expected === null) {
    return { ...empty, error: "The stored expected status is invalid." };
  }
  const timeoutMs = readTimeoutSec(health) * 1000;

  let url: URL;
  try {
    url = new URL(built.url);
  } catch {
    return { ...empty, error: "The stored health check target is invalid." };
  }
  if (url.username !== "" || url.password !== "") {
    return { ...empty, error: "Refusing to check a target URL with credentials." };
  }
  const blocked = await resolvePublicHost(url.hostname);
  if (blocked) return { ...empty, error: blocked };

  let serviceId = options.serviceId ?? null;
  if (!serviceId) {
    const resolved = await ensureMonitoredService(supabase, projectId, built.url);
    if ("error" in resolved) return { ...empty, error: resolved.error };
    serviceId = resolved.id;
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let classification: HttpCheckClassification;
  let statusCode: number | null = null;
  try {
    const res = await fetch(built.url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": "devops-safeguard-check/1.0" },
    });
    statusCode = res.status;
    // Drain nothing: the body is irrelevant and never stored.
    await res.arrayBuffer().catch(() => null);
    classification = classifyHttpStatus(res.status, expected);
  } catch (error) {
    classification =
      error instanceof Error && error.name === "AbortError"
        ? classifyNoResponse("timeout")
        : classifyNoResponse("network");
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;

  // The persisted external-observation contract lives in
  // `buildExternalObservation` (unit-tested pure core): source='external',
  // is_demo=false, no body/headers/secrets — only status, latency, and URL.
  const checkedAt = new Date().toISOString();
  const observation = buildExternalObservation({
    checkedUrl: built.url,
    target: health.targetUrl,
    path: health.endpoint,
    statusCode,
    expectedStatus: expected,
    latencyMs,
    classification,
    checkedAt,
  });

  const insert: Record<string, unknown> = {
    project_id: projectId,
    service_id: serviceId,
    status: observation.status,
    source: observation.source,
    latency_ms: observation.latencyMs,
    error_rate: observation.errorRate,
    detail: observation.detail,
    metadata: observation.metadata,
    is_demo: observation.isDemo,
    checked_at: observation.checkedAt,
  };
  if (options.observationId) insert.id = options.observationId;
  const { error: insertError } = await supabase
    .from("service_health_checks")
    .insert(insert);

  if (insertError) {
    // A duplicate primary key means this exact observation was already
    // recorded (a retried write). That is success, not corruption.
    if (options.observationId && insertError.code === "23505") {
      return await finishDetection(supabase, projectId, options.userId ?? null, {
        ...empty,
        ok: true,
        observed: true,
        checkedUrl: built.url,
        statusCode,
        status: observation.status,
        latencyMs,
        checkedAt,
        serviceId,
      });
    }
    // Never swallow this: a check whose result was not recorded must not be
    // reported as a successful check.
    return {
      ...empty,
      checkedUrl: built.url,
      statusCode,
      status: observation.status,
      latencyMs,
      checkedAt,
      serviceId,
      error: "The health check ran, but its result could not be saved. Nothing was recorded.",
    };
  }

  await markMonitoringActive(supabase, projectId);

  return await finishDetection(supabase, projectId, options.userId ?? null, {
    ...empty,
    ok: true,
    observed: true,
    checkedUrl: built.url,
    statusCode,
    status: observation.status,
    latencyMs,
    checkedAt,
    serviceId,
  });
}

/** Run the existing detection pass over the project and report its outcome. */
async function finishDetection(
  supabase: SupabaseClient,
  projectId: string,
  userId: string | null,
  result: ExternalCheckResult,
): Promise<ExternalCheckResult> {
  const tick = await runMonitorTick(supabase, projectId, userId);
  if (!tick.ok) {
    return {
      ...result,
      ok: false,
      tickOk: false,
      error: "Detection pass failed. Check the database migration.",
    };
  }
  return {
    ...result,
    tickOk: true,
    createdIncidents: tick.createdIncidents,
    resolvedIncidents: tick.resolvedIncidents,
  };
}

/**
 * A real observation now exists, so monitoring is honestly "active" rather
 * than "pending". Best-effort: a failed status flip must never fail the check
 * itself. Only 'pending' is ever transitioned here — any other value
 * (including a manually set 'degraded'/'unknown') is left untouched, since no
 * additional status semantics are defined for this phase.
 */
async function markMonitoringActive(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { data: configStatus } = await supabase
    .from("project_configs")
    .select("monitoring_status")
    .eq("project_id", projectId)
    .maybeSingle();
  if (
    configStatus &&
    (configStatus as { monitoring_status?: unknown }).monitoring_status === "pending"
  ) {
    await supabase
      .from("project_configs")
      .update({ monitoring_status: "active" })
      .eq("project_id", projectId);
  }
}
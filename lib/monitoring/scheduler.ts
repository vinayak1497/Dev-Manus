/**
 * Automatic monitoring scheduler — one unattended tick.
 *
 * This is the Phase 2 entry point. It answers one question — "what is due
 * right now?" — and then runs the EXISTING Phase 1 check for each answer.
 * It deliberately owns no probe, no classification, no incident and no
 * recovery logic of its own:
 *
 *   discovery  -> project_configs (what is configured, is it enabled)
 *   ensure     -> ensureMonitoredService (the same canonical service the
 *                 manual button uses)
 *   claim      -> one conditional UPDATE on `services` — the atomic,
 *                 expiring claim
 *   check      -> runConfiguredHttpCheckCore (GET, classify, persist)
 *   schedule   -> write the next due time, computed from the STORED
 *                 `intervalSec`
 *
 * Scheduling truth lives in Postgres (`services.monitoring_next_check_at`),
 * never in a process-local timer, so restarting the worker neither loses nor
 * replays work. Nothing here is exported to a browser and nothing is invoked
 * from a request; `worker/monitor-worker.ts` is the only caller.
 *
 * Data integrity rules honoured here:
 * - a tick NEVER invents an observation. Only `runConfiguredHttpCheckCore`
 *   writes `service_health_checks`, and it writes what the HTTP request
 *   actually returned;
 * - the due time is derived from the configured interval and the OBSERVATION's
 *   timestamp, never from the poll timestamp;
 * - one failed project never stops the batch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { buildHealthCheckUrl } from "../onboarding/health";
import { normalizeStoredHealth, type StoredHealth } from "../onboarding/stored-config";
import {
  MONITORED_SERVICE_NAME,
  ensureMonitoredService,
  runConfiguredHttpCheckCore,
} from "./external-check";
import { hasRunnableHttpConfig, readFailureThreshold, readIntervalSec } from "./health-settings";
import {
  claimDueCheck,
  completeClaimedCheck,
  releaseWorkerClaims,
  retryClaimedCheck,
} from "./claims";

// Kept as exports for the existing integration/manual test seam. The actual
// implementation lives in claims.ts and is shared with the manual action.
export { claimDueCheck, releaseWorkerClaims } from "./claims";

/** Default lease length. Long enough for timeoutSec + slow writes, short
 *  enough that a crashed worker's work returns to the queue promptly. */
export const DEFAULT_LEASE_SECONDS = 120;

/** Retry pacing for a check that could not run or could not be recorded. */
export const MIN_ERROR_BACKOFF_SEC = 30;
export const MAX_ERROR_BACKOFF_SEC = 600;

export type SchedulerLogLevel = "debug" | "info" | "warn" | "error";
export type SchedulerLogger = (
  level: SchedulerLogLevel,
  message: string,
  fields?: Record<string, unknown>,
) => void;

export type SchedulerItemOutcome =
  | { projectId: string; outcome: "checked"; status: string; observed: boolean }
  | { projectId: string; outcome: "check_failed"; error: string }
  | { projectId: string; outcome: "skipped"; reason: string }
  | { projectId: string; outcome: "ineligible"; reason: string };

export type SchedulerTickResult = {
  ok: boolean;
  /** Set when the pass could not run at all (bad schema, database down). */
  error?: string;
  /** Projects with automatic monitoring switched on. */
  eligible: number;
  due: number;
  checked: number;
  failed: number;
  skipped: number;
  ineligible: number;
  items: SchedulerItemOutcome[];
};

export type SchedulerOptions = {
  supabase: SupabaseClient;
  /** Identifies this worker in `services.monitoring_worker_id`. */
  workerId: string;
  /** Injectable clock — tests drive this instead of sleeping. */
  now?: () => Date;
  /** Restrict the pass to one project (manual/single-project operation). */
  projectId?: string | null;
  batchLimit?: number;
  leaseSeconds?: number;
  /** Maximum checks in flight at once. Bounded on purpose. */
  concurrency?: number;
  log?: SchedulerLogger;
  /**
   * Operator-configured trusted private hosts (worker env allowlist).
   * Absent or empty means default-deny, exactly as before.
   */
  trustedPrivateHosts?: readonly string[];
};

export const DEFAULT_BATCH_LIMIT = 200;

/** Simultaneous checks. Small on purpose: each one is an outbound request to
 *  somebody's production endpoint plus a handful of database writes. */
export const DEFAULT_CONCURRENCY = 4;

/** Errors that will not fix themselves by retrying sooner. */
const CONFIGURATION_ERROR_RETRY_SEC = 300;

function iso(date: Date): string {
  return date.toISOString();
}

function plusSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + Math.max(0, seconds) * 1000).toISOString();
}

type IneligibleOutcome = {
  projectId: string;
  outcome: "ineligible";
  reason: string;
};

type Candidate = {
  projectId: string;
  health: StoredHealth;
  intervalSec: number;
  checkedUrl: string;
};

type DueService = {
  id: string;
  project_id: string;
  monitoring_next_check_at: string | null;
  monitoring_lease_expires_at: string | null;
};

/**
 * Delay before the next attempt after a check that could not run or could not
 * be recorded.
 *
 * Bounded exponential backoff: a transient outage must not turn into a tight
 * retry loop, and a permanently misconfigured target must not be retried
 * forever at full cadence. Exported as a pure function so the pacing is
 * unit-tested rather than observed by waiting.
 */
export function retryDelaySeconds(
  kind: "configuration" | "transient",
  intervalSec: number,
  attempt: number,
): number {
  const base = Math.max(1, Math.trunc(intervalSec) || 1);
  if (kind === "configuration") {
    return Math.min(MAX_ERROR_BACKOFF_SEC, Math.max(CONFIGURATION_ERROR_RETRY_SEC, base));
  }
  const step = Math.min(6, Math.max(0, Math.trunc(attempt) || 0));
  return Math.min(MAX_ERROR_BACKOFF_SEC, Math.max(MIN_ERROR_BACKOFF_SEC, base) * 2 ** step);
}

/**
 * One discovery query. Returns the projects that have automatic monitoring
 * switched on and a usable HTTP target.
 *
 * A database that has not had the Phase 2 migration applied reports an
 * undefined-column error; that is surfaced as a normal, actionable pass error
 * rather than silently monitoring nothing.
 */
async function discoverCandidates(
  supabase: SupabaseClient,
  projectId: string | null,
  log: SchedulerLogger | undefined,
): Promise<{ candidates: Candidate[]; ineligible: IneligibleOutcome[]; error?: string }> {
  let query = supabase
    .from("project_configs")
    .select("project_id, health, monitoring_enabled")
    .eq("monitoring_enabled", true);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) {
    log?.("error", "scheduler.discovery_failed", { message: error.message, code: error.code });
    return { candidates: [], ineligible: [], error: error.message };
  }

  const candidates: Candidate[] = [];
  const ineligible: IneligibleOutcome[] = [];
  for (const row of (data ?? []) as { project_id: string; health: unknown; monitoring_enabled: unknown }[]) {
    const health = normalizeStoredHealth((row.health ?? null) as never);
    if (!hasRunnableHttpConfig(health)) {
      ineligible.push({
        projectId: row.project_id,
        outcome: "ineligible",
        reason: "no runnable HTTP health check is configured",
      });
      continue;
    }
    const built = buildHealthCheckUrl(health?.targetUrl ?? "", health?.endpoint ?? "");
    if (built.error || !built.url) {
      // One broken configuration must not stop every other project.
      ineligible.push({
        projectId: row.project_id,
        outcome: "ineligible",
        reason: built.error ?? "the stored health check target is incomplete",
      });
      continue;
    }
    candidates.push({
      projectId: row.project_id,
      health: health as StoredHealth,
      intervalSec: readIntervalSec(health),
      checkedUrl: built.url,
    });
  }
  return { candidates, ineligible };
}

/**
 * Resolve which candidates are due, creating the canonical service row where
 * one does not exist yet.
 *
 * The row is created HERE rather than inside the check, and that ordering
 * matters: a project that has never been probed has no service row, and a
 * service row with no due time is exactly what "due immediately" looks like.
 * Creating it in the check instead would mean a brand-new project could never
 * be claimed, because there would be nothing to claim.
 *
 * `ensureMonitoredService` is the SAME helper the manual "Run HTTP check"
 * action uses, so both paths resolve one identical service per project.
 */
async function resolveDueServices(
  supabase: SupabaseClient,
  candidates: Candidate[],
  now: Date,
  log: SchedulerLogger | undefined,
): Promise<{ services: DueService[]; error?: string }> {
  const ids = candidates.map((c) => c.projectId);
  if (ids.length === 0) return { services: [] };
  const { data, error: serviceReadError } = await supabase
    .from("services")
    .select("id, project_id, monitoring_next_check_at, monitoring_lease_expires_at")
    .in("project_id", ids)
    .eq("name", MONITORED_SERVICE_NAME)
    .eq("is_demo", false);
  if (serviceReadError) {
    log?.("error", "scheduler.service_discovery_failed", {
      message: serviceReadError.message,
      code: serviceReadError.code,
    });
    return { services: [], error: serviceReadError.message };
  }
  const existing = new Map(
    ((data ?? []) as DueService[]).map((row) => [row.project_id, row]),
  );

  for (const candidate of candidates) {
    if (existing.has(candidate.projectId)) continue;
    const resolved = await ensureMonitoredService(
      supabase,
      candidate.projectId,
      candidate.checkedUrl,
    );
    if ("error" in resolved) {
      // One project's service row failing must not stop the batch.
      log?.("warn", "scheduler.service_setup_failed", {
        projectId: candidate.projectId,
        reason: resolved.error,
      });
      continue;
    }
    existing.set(candidate.projectId, {
      id: resolved.id,
      project_id: candidate.projectId,
      monitoring_next_check_at: null,
      monitoring_lease_expires_at: null,
    });
    log?.("debug", "scheduler.service_created", {
      projectId: candidate.projectId,
      serviceId: resolved.id,
    });
  }

  const nowMs = now.getTime();
  return {
    services: Array.from(existing.values()).filter((row) => {
    const dueAt = row.monitoring_next_check_at
      ? Date.parse(row.monitoring_next_check_at)
      : Number.NEGATIVE_INFINITY;
    const leaseUntil = row.monitoring_lease_expires_at
      ? Date.parse(row.monitoring_lease_expires_at)
      : Number.NEGATIVE_INFINITY;
    // Invalid persisted timestamps are not allowed to strand a service.
    return (!Number.isFinite(dueAt) || dueAt <= nowMs) &&
      (!Number.isFinite(leaseUntil) || leaseUntil <= nowMs);
    }),
  };
}

/** Does this failure describe a target we should stop retrying quickly? */
function errorKind(error: string): "configuration" | "transient" {
  return /configured|incomplete|invalid|Refusing|does not resolve/.test(error)
    ? "configuration"
    : "transient";
}

/** A pass that could not run at all — reported, never thrown. */
function failPass(result: SchedulerTickResult, error: string): SchedulerTickResult {
  return { ...result, ok: false, error };
}

/** An infrastructure error as an honest message, never a thrown rejection. */
function describeInfraError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run one scheduler pass: discover, claim, check, schedule.
 *
 * Never throws for an individual project's failure — those are captured per
 * project so one broken target cannot stop monitoring for every other one.
 */
export async function runSchedulerTick(options: SchedulerOptions): Promise<SchedulerTickResult> {
  const {
    supabase,
    workerId,
    now = () => new Date(),
    projectId = null,
    batchLimit = DEFAULT_BATCH_LIMIT,
    leaseSeconds = DEFAULT_LEASE_SECONDS,
    concurrency = DEFAULT_CONCURRENCY,
    log,
    trustedPrivateHosts = [],
  } = options;

  const result: SchedulerTickResult = {
    ok: true,
    eligible: 0,
    due: 0,
    checked: 0,
    failed: 0,
    skipped: 0,
    ineligible: 0,
    items: [],
  };

  // A client that is fundamentally broken (or a database that is gone) must
  // surface as a failed pass, not as a rejection that escapes the scheduler.
  // supabase-js itself reports query problems as `{ error }`, but a caller
  // that miswires the client entirely still gets an honest answer.
  let discovery: Awaited<ReturnType<typeof discoverCandidates>>;
  try {
    discovery = await discoverCandidates(supabase, projectId, log);
  } catch (error) {
    log?.("error", "scheduler.discovery_threw", { message: describeInfraError(error) });
    return failPass(result, `Could not read project configurations: ${describeInfraError(error)}`);
  }
  if (discovery.error) {
    return failPass(result, `Could not read project configurations: ${discovery.error}`);
  }
  result.eligible = discovery.candidates.length;
  result.ineligible = discovery.ineligible.length;
  result.items.push(...discovery.ineligible);
  for (const item of discovery.ineligible) {
    log?.("debug", "scheduler.project_ineligible", {
      projectId: item.projectId,
      reason: item.reason,
    });
  }

  const limited = discovery.candidates.slice(0, Math.max(1, batchLimit));
  if (limited.length < discovery.candidates.length) {
    log?.("warn", "scheduler.batch_truncated", {
      selected: limited.length,
      eligible: discovery.candidates.length,
    });
  }

  let resolved: Awaited<ReturnType<typeof resolveDueServices>>;
  try {
    resolved = await resolveDueServices(supabase, limited, now(), log);
  } catch (error) {
    log?.("error", "scheduler.service_discovery_threw", { message: describeInfraError(error) });
    return failPass(result, `Could not read monitored services: ${describeInfraError(error)}`);
  }
  if (resolved.error) {
    // We cannot know what is due, so nothing ran. Report it as a failed pass
    // rather than a quiet "0 checked" one — the worker's pass-level backoff
    // paces the retries.
    return failPass(result, `Could not read monitored services: ${resolved.error}`);
  }
  const dueServices = resolved.services;
  result.due = dueServices.length;
  const dueByProject = new Map(dueServices.map((s) => [s.project_id, s]));
  // Consecutive-failed-attempt counters are per project and per process. They
  // only pace retries; the durable scheduling state is `next_check_at`, so
  // losing them on restart costs at most one faster retry, never a lost check.
  const attempts = new Map<string, number>();

  const runOne = async (candidate: Candidate): Promise<void> => {
    const service = dueByProject.get(candidate.projectId);
    if (!service) {
      result.skipped += 1;
      result.items.push({
        projectId: candidate.projectId,
        outcome: "skipped",
        reason: "not due yet",
      });
      return;
    }

    const attempt = attempts.get(candidate.projectId) ?? 0;
    const runId = randomUUID();
    const claimed = await claimDueCheck(
      supabase,
      service.id,
      workerId,
      runId,
      now(),
      leaseSeconds,
    );
    if (!claimed) {
      result.skipped += 1;
      result.items.push({
        projectId: candidate.projectId,
        outcome: "skipped",
        reason: "claimed by another worker",
      });
      log?.("debug", "scheduler.claim_lost", { projectId: candidate.projectId, serviceId: service.id });
      return;
    }

    // From here the claim is ours. Every exit path MUST release it, otherwise
    // the service waits out the whole lease before it can be retried.
    try {
      const check = await runConfiguredHttpCheckCore({
        supabase,
        projectId: candidate.projectId,
        serviceId: service.id,
        observationId: runId,
        userId: null,
        trustedPrivateHosts,
      });

      // Record the failure and schedule a bounded retry. `retryClaimedCheck` only
      // writes when this worker still owns the claim: if the lease expired
      // mid-check and another worker took over, the write is refused and the
      // service keeps the other worker's cursor instead of ours.
      const recordFailure = async (
        message: string,
        kind: "configuration" | "transient",
      ): Promise<void> => {
        attempts.set(candidate.projectId, attempt + 1);
        await retryClaimedCheck(supabase, {
          serviceId: service.id,
          workerId,
          runId,
          nextCheckAt: plusSeconds(
            now(),
            retryDelaySeconds(kind, candidate.intervalSec, attempt),
          ),
          error: message,
        }).catch(() => undefined);
        result.failed += 1;
        result.items.push({ projectId: candidate.projectId, outcome: "check_failed", error: message });
        log?.("warn", "scheduler.check_failed", {
          projectId: candidate.projectId,
          serviceId: service.id,
          reason: message,
          attempt: attempt + 1,
        });
      };

      if (!check.ok || !check.observed || !check.checkedAt || !check.status) {
        const message = check.error ?? "The health check did not produce an observation.";
        await recordFailure(message, errorKind(message));
        return;
      }

      attempts.delete(candidate.projectId);
      // Conditional completion, same rule as the failure path: if ownership
      // was lost mid-check, the observation is still recorded (its id makes a
      // retry a no-op) but the scheduling cursor is not ours to write. The
      // service simply becomes due again on its existing cursor.
      const completed = await completeClaimedCheck(supabase, {
        serviceId: service.id,
        workerId,
        runId,
        checkedAt: check.checkedAt,
        status: check.status,
        intervalSec: candidate.intervalSec,
      });
      if (!completed) {
        await recordFailure(
          "The health check ran, but its scheduling state could not be saved because the claim changed hands. It will run again on its existing schedule.",
          "transient",
        );
        return;
      }
      result.checked += 1;
      result.items.push({
        projectId: candidate.projectId,
        outcome: "checked",
        status: check.status,
        observed: true,
      });
      log?.("info", "scheduler.check_completed", {
        projectId: candidate.projectId,
        serviceId: service.id,
        status: check.status,
        statusCode: check.statusCode,
        latencyMs: check.latencyMs,
        checkedUrl: check.checkedUrl,
        nextCheckAt: plusSeconds(now(), candidate.intervalSec),
        failureThreshold: readFailureThreshold(candidate.health),
      });
    } catch (error) {
      // A thrown error here is an infrastructure problem (not the monitored
      // application). Release the claim if it is still ours, back off, keep
      // the batch going.
      const message = error instanceof Error ? error.message : String(error);
      attempts.set(candidate.projectId, attempt + 1);
      await retryClaimedCheck(supabase, {
        serviceId: service.id,
        workerId,
        runId,
        nextCheckAt: plusSeconds(
          now(),
          retryDelaySeconds("transient", candidate.intervalSec, attempt),
        ),
        error: message,
      }).catch(() => undefined);
      result.failed += 1;
      result.items.push({ projectId: candidate.projectId, outcome: "check_failed", error: message });
      log?.("error", "scheduler.check_threw", {
        projectId: candidate.projectId,
        serviceId: service.id,
        message,
      });
    }
  };

  // Bounded concurrency. Every worker re-checks its own claim atomically, so
  // raising this number can never produce a duplicate check — it only changes
  // how fast a large batch drains. No unbounded Promise.all over projects.
  const queue = [...limited];
  const lanes = Math.max(1, Math.min(concurrency, queue.length));
  let cursor = 0;
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= queue.length) return;
        await runOne(queue[index]);
      }
    }),
  );

  return result;
}

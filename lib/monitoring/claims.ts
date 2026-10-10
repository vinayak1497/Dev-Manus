/**
 * Database-backed ownership for one monitoring execution.
 *
 * The worker and the authenticated manual action use the same claim contract:
 * a service row is the lock, the lease expires, and every completion update is
 * conditional on both the run id and worker id still belonging to the caller.
 * The ownership predicate on completion is important: a slow request whose
 * lease has expired must not clear or overwrite a replacement worker's claim.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CheckClaim = {
  serviceId: string;
  workerId: string;
  runId: string;
  now: Date;
  leaseSeconds: number;
};

export type CompletedCheck = {
  serviceId: string;
  workerId: string;
  runId: string;
  checkedAt: string;
  status: string;
  intervalSec: number;
  lastError?: string | null;
};

function iso(date: Date): string {
  return date.toISOString();
}

function plusSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + Math.max(0, seconds) * 1000).toISOString();
}

/**
 * A pending UPDATE on `services`, narrow enough to keep appending row
 * filters. The structural bound is load-bearing: `supabase.from()` alone is
 * a query builder WITHOUT row filters, so the parameter must say "an update
 * in progress with an eq filter", otherwise a caller could hand in a
 * filter-less query that matches every row.
 */
function ownership<Query extends { eq(column: string, value: unknown): Query }>(
  query: Query,
  claim: Pick<CheckClaim, "runId" | "workerId">,
): Query {
  return query
    .eq("monitoring_run_id", claim.runId)
    .eq("monitoring_worker_id", claim.workerId);
}

async function claim(
  supabase: SupabaseClient,
  input: CheckClaim,
  requireDue: boolean,
): Promise<boolean> {
  const nowIso = iso(input.now);
  let query = supabase
    .from("services")
    .update({
      monitoring_run_id: input.runId,
      monitoring_worker_id: input.workerId,
      monitoring_lease_expires_at: plusSeconds(input.now, input.leaseSeconds),
    })
    .eq("id", input.serviceId);

  if (requireDue) {
    query = query.or(`monitoring_next_check_at.is.null,monitoring_next_check_at.lte.${nowIso}`);
  }
  query = query.or(`monitoring_lease_expires_at.is.null,monitoring_lease_expires_at.lte.${nowIso}`);

  const { data, error } = await query.select("id").maybeSingle();
  return !error && Boolean(data);
}

/** Claim only when the persistent due time has arrived. */
export async function claimDueCheck(
  supabase: SupabaseClient,
  serviceId: string,
  workerId: string,
  runId: string,
  now: Date,
  leaseSeconds: number,
): Promise<boolean> {
  return claim(
    supabase,
    { serviceId, workerId, runId, now, leaseSeconds },
    true,
  );
}

/** Claim an explicit manual check without bypassing a live automatic lease. */
export async function claimManualCheck(
  supabase: SupabaseClient,
  serviceId: string,
  workerId: string,
  runId: string,
  now: Date,
  leaseSeconds: number,
): Promise<boolean> {
  return claim(
    supabase,
    { serviceId, workerId, runId, now, leaseSeconds },
    false,
  );
}

/**
 * Persist a real observation's next due time and release its lease.
 *
 * The due time is anchored to the observation timestamp, not the later worker
 * poll timestamp. An empty update result means ownership was lost, so callers
 * must report scheduling persistence as a failure rather than pretending the
 * run was fully scheduled.
 */
export async function completeClaimedCheck(
  supabase: SupabaseClient,
  input: CompletedCheck,
): Promise<boolean> {
  const checkedAt = new Date(input.checkedAt);
  const anchor = Number.isFinite(checkedAt.getTime()) ? checkedAt : new Date();
  const query = supabase
    .from("services")
    .update({
      monitoring_last_check_at: input.checkedAt,
      monitoring_last_status: input.status,
      monitoring_next_check_at: plusSeconds(anchor, input.intervalSec),
      monitoring_run_id: null,
      monitoring_lease_expires_at: null,
      monitoring_worker_id: null,
      monitoring_last_error: input.lastError ?? null,
    })
    .eq("id", input.serviceId);
  const { data, error } = await ownership(query, input).select("id").maybeSingle();
  return !error && Boolean(data);
}

/**
 * Release an owned claim and schedule a bounded retry after a transient or
 * configuration failure. The current claim must still belong to this caller.
 */
export async function retryClaimedCheck(
  supabase: SupabaseClient,
  input: {
    serviceId: string;
    workerId: string;
    runId: string;
    nextCheckAt: string;
    error: string;
  },
): Promise<boolean> {
  const query = supabase
    .from("services")
    .update({
      monitoring_last_error: input.error.slice(0, 500),
      monitoring_next_check_at: input.nextCheckAt,
      monitoring_run_id: null,
      monitoring_lease_expires_at: null,
      monitoring_worker_id: null,
    })
    .eq("id", input.serviceId);
  const { data, error } = await ownership(query, input).select("id").maybeSingle();
  return !error && Boolean(data);
}

/** Release only this worker's claims during graceful shutdown. */
export async function releaseWorkerClaims(
  supabase: SupabaseClient,
  workerId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("services")
    .update({
      monitoring_lease_expires_at: null,
      monitoring_run_id: null,
      monitoring_worker_id: null,
    })
    .eq("monitoring_worker_id", workerId)
    .select("id");
  if (error) return 0;
  return (data ?? []).length;
}

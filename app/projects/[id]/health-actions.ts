"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildHealthCheckUrl } from "@/lib/onboarding/health";
import { readProjectConfig } from "@/lib/project-config-read";
import {
  ensureMonitoredService,
  runConfiguredHttpCheckCore,
} from "@/lib/monitoring/external-check";
import {
  claimManualCheck,
  completeClaimedCheck,
  retryClaimedCheck,
} from "@/lib/monitoring/claims";
import { readIntervalSec } from "@/lib/monitoring/health-settings";
import { parseTrustedPrivateHosts } from "@/lib/monitoring/trusted-targets";
import { retryDelaySeconds } from "@/lib/monitoring/scheduler";
import {
  activeIncidentOnService,
  authed,
  canSeeProject,
  type ActionResult,
} from "./incidents/actions";

/**
 * Run the project's CONFIGURED HTTP check once and record the observation.
 *
 * This is the manual half of Phase 1's real monitoring path, and the manual
 * half of Phase 2's automatic monitoring: the request, the classification and
 * the persistence all happen in `runConfiguredHttpCheckCore`
 * (`lib/monitoring/external-check.ts`), which the unattended worker calls too.
 * There is exactly one probe implementation in this repository.
 *
 * Concurrency with the worker is handled, not hoped away: this action claims
 * the canonical service through the SAME lease contract the worker uses
 * (`lib/monitoring/claims.ts`). A manual click that lands while the worker is
 * mid-check is refused with an honest "already running" instead of executing
 * a second, simultaneous fetch — and a manual check that just ran advances
 * the worker's next-due time, so the worker does not immediately repeat it.
 *
 * Safety (repository input is untrusted, and so is any user-entered URL):
 * - only http/https targets, never with credentials (re-validated in the core,
 *   not just in the wizard);
 * - hostnames that are structurally internal are rejected without DNS;
 * - resolved addresses must all be public;
 * - redirects are not followed (a 3xx is an observation, not a rabbit hole);
 * - response bodies are never stored or logged — only status, latency, and
 *   the checked URL.
 *
 * Access control here is unchanged from Phase 1: `authed()` verifies the
 * session and `canSeeProject` relies on RLS, so an id belonging to another
 * tenant returns "Project not found." rather than running a check.
 */

/** How long a manual check may hold the service while it runs. */
const MANUAL_LEASE_SECONDS = 120;

/**
 * Trusted private hosts for manual checks: the same server-side allowlist
 * the worker uses. Returns the parsed list, or throws a fail-closed,
 * operator-facing error when the configuration itself is malformed.
 */
function readManualTrustedHosts(): readonly string[] {
  const parsed = parseTrustedPrivateHosts(process.env.MONITOR_ALLOWED_PRIVATE_HOSTS);
  if (parsed.errors.length > 0) {
    throw new Error(
      `The monitoring trust configuration is invalid: ${parsed.errors.join(" ")}`,
    );
  }
  return parsed.hosts;
}

export async function runConfiguredHttpCheck(
  projectId: string,
): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  if (!(await canSeeProject(supabase, projectId))) {
    return { ok: false, error: "Project not found." };
  }

  // Resolve the canonical service up front so the claim below targets the
  // same row the worker claims. This duplicates the core's own config read on
  // purpose: the core stays the single authority on "can this run?", while
  // this action only needs the URL to find the row to claim.
  const { config } = await readProjectConfig(supabase, projectId);
  const health = config?.health;
  if (!health || health.method !== "http") {
    return {
      ok: false,
      error:
        "This project has no HTTP health check configured. Set a target URL and endpoint path in onboarding first.",
    };
  }
  const built = buildHealthCheckUrl(health.targetUrl ?? "", health.endpoint ?? "");
  if (built.error || !built.url) {
    return { ok: false, error: built.error ?? "The stored health check target is incomplete." };
  }
  const resolved = await ensureMonitoredService(supabase, projectId, built.url);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const serviceId = resolved.id;

  // Same server-side trust policy the worker uses, validated BEFORE claiming
  // so a malformed allowlist fails closed without holding the service lease.
  let trustedPrivateHosts: readonly string[];
  try {
    trustedPrivateHosts = readManualTrustedHosts();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The monitoring trust configuration is invalid.",
    };
  }

  const workerId = `manual:${userId}`;
  const runId = randomUUID();
  const claimed = await claimManualCheck(
    supabase,
    serviceId,
    workerId,
    runId,
    new Date(),
    MANUAL_LEASE_SECONDS,
  );
  if (!claimed) {
    return {
      ok: false,
      error: "A health check is already running for this project. Wait a moment and try again.",
    };
  }

  // Same server-side trust policy the worker uses (validated above).
  const result = await runConfiguredHttpCheckCore({
    supabase,
    projectId,
    serviceId,
    observationId: runId,
    userId,
    trustedPrivateHosts,
  });

  const intervalSec = readIntervalSec(health);
  if (!result.ok || !result.observed || !result.checkedAt || !result.status) {
    const message = result.error ?? "The health check did not produce an observation.";
    await retryClaimedCheck(supabase, {
      serviceId,
      workerId,
      runId,
      nextCheckAt: new Date(
        Date.now() + retryDelaySeconds("transient", intervalSec, 0) * 1000,
      ).toISOString(),
      error: message,
    }).catch(() => undefined);
    return { ok: false, error: message };
  }

  const completed = await completeClaimedCheck(supabase, {
    serviceId,
    workerId,
    runId,
    checkedAt: result.checkedAt,
    status: result.status,
    intervalSec,
  });
  if (!completed) {
    // The observation above IS recorded; only the scheduling write lost a
    // race (the lease expired mid-check and someone else claimed it). Say so
    // plainly instead of pretending the whole run succeeded or failed.
    return {
      ok: true,
      message:
        "Check recorded, but the scheduling state changed hands mid-check — the next automatic check will use the current schedule.",
    };
  }

  const incidentId = await activeIncidentOnService(supabase, projectId, serviceId);
  revalidatePath(`/projects/${projectId}`);
  if (incidentId) revalidatePath(`/projects/${projectId}/incidents/${incidentId}`);

  const observed =
    result.statusCode === null || result.statusCode === undefined
      ? "no response"
      : `HTTP ${result.statusCode}`;
  return {
    ok: true,
    incidentId: incidentId ?? undefined,
    message:
      result.createdIncidents > 0
        ? `Check observed ${observed} — the detector opened an incident.`
        : result.resolvedIncidents > 0
          ? `Check observed ${observed} — recovery verified, incident resolved.`
          : `Check observed ${observed} — no change.`,
  };
}
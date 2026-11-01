"use server";

import { revalidatePath } from "next/cache";
import { buildHealthCheckUrl } from "@/lib/onboarding/health";
import {
  readAutomaticMonitoringEnabled,
  readProjectConfig,
} from "@/lib/project-config-read";
import { createClient } from "@/lib/supabase/server";
import {
  saveHealthConfigurationCore,
  type HealthSaveResult,
  type HealthSettingsInput,
} from "@/lib/monitoring/health-edit";
import { createSupabaseHealthEditBackend } from "@/lib/monitoring/health-edit-supabase";
import { ensureMonitoredService } from "@/lib/monitoring/external-check";
import {
  authed,
  canSeeProject,
  type ActionResult,
} from "./incidents/actions";

/**
 * Persist edited health monitoring settings for one project.
 *
 * The save core (lib/monitoring/health-edit.ts) does the authorization,
 * validation, merge and stale-state reset; this wrapper only supplies the
 * cookie-scoped Supabase client and revalidates the dashboard. It is
 * deliberately NOT the check path: saving configuration never probes the
 * target, so a successful save can never fabricate a health observation.
 */
export async function saveHealthConfiguration(
  projectId: string,
  input: HealthSettingsInput,
): Promise<HealthSaveResult> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return {
      ok: false,
      error:
        "Authentication isn't configured. Add the Supabase keys to .env.local.",
    };
  }

  let result: HealthSaveResult;
  try {
    result = await saveHealthConfigurationCore(
      createSupabaseHealthEditBackend(supabase),
      projectId,
      input,
    );
  } catch (error) {
    // A thrown network/driver error is a failed save, never a success. Log the
    // message only — the submitted values may contain a target URL.
    console.error(
      "saveHealthConfiguration failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return {
      ok: false,
      error: "The health configuration could not be saved. Please retry.",
    };
  }

  if (result.ok) {
    revalidatePath(`/projects/${projectId}`);
  }
  return result;
}

/**
 * Request the project's CONFIGURED HTTP check to run now.
 *
 * The Next.js app and the monitoring worker are separate execution
 * environments. Private-target probes — and the operator allowlist that can
 * authorize them — live only in the worker. This action therefore never
 * performs the HTTP request itself. It validates the stored configuration,
 * then moves the canonical service's existing due time to now. The worker's
 * normal scheduler pass claims and executes it with the same lease contract
 * used by automatic monitoring.
 *
 * Concurrency: the due-time update is conditional on the same
 * `monitoring_lease_expires_at` predicate the worker uses, so a manual request
 * can never bypass a live check. If the lease is held, the action returns the
 * existing "already running" message. Two simultaneous requests with no lease
 * simply coalesce onto the same due time; the worker still runs one check.
 *
 * The response is deliberately asynchronous: it reports that the check was
 * queued, never that the HTTP request succeeded. The dashboard polls for the
 * worker's real observation.
 *
 * Safety: the web process never fetches the target and never parses
 * `MONITOR_ALLOWED_PRIVATE_HOSTS`. `resolvePublicHost` remains the single SSRF
 * gate, and it runs only in the worker.
 *
 * Access control is unchanged from Phase 1: `authed()` verifies the session
 * and `canSeeProject` relies on RLS, so an id belonging to another tenant
 * returns "Project not found." rather than queueing a check.
 */
export async function runConfiguredHttpCheck(
  projectId: string,
): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase } = auth.ctx;

  if (!(await canSeeProject(supabase, projectId))) {
    return { ok: false, error: "Project not found." };
  }

  // Validate the stored configuration before touching the service row. The
  // worker re-reads the same configuration when it executes the check; this
  // action never probes the target itself.
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

  // B1: the worker is the only execution environment that can run private
  // probes, and the scheduler only discovers projects whose automatic
  // monitoring is explicitly enabled. Requiring the flag here means a queued
  // request is guaranteed to have a worker pass that will see it.
  const monitoringEnabled = await readAutomaticMonitoringEnabled(
    supabase,
    projectId,
  );
  if (monitoringEnabled === false) {
    return {
      ok: false,
      error:
        "Automatic monitoring is off for this project. Enable it before requesting a check.",
    };
  }
  if (monitoringEnabled === null) {
    return {
      ok: false,
      error:
        "Automatic monitoring is not enabled for this project yet. Enable it before requesting a check; if the setting is missing, apply the monitoring migration.",
    };
  }

  const resolved = await ensureMonitoredService(supabase, projectId, built.url);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const serviceId = resolved.id;

  // Queue an immediate check by moving the existing due time to now. The
  // update is conditional on the SAME lease predicate the worker uses, so a
  // manual request can never bypass a live check. Zero rows means a worker
  // already holds the lease (or the service disappeared); both are reported
  // honestly rather than pretending the check was queued.
  const nowIso = new Date().toISOString();
  const { data: queued, error: queueError } = await supabase
    .from("services")
    .update({ monitoring_next_check_at: nowIso })
    .eq("id", serviceId)
    .eq("project_id", projectId)
    .eq("is_demo", false)
    .or(
      `monitoring_lease_expires_at.is.null,monitoring_lease_expires_at.lte.${nowIso}`,
    )
    .select("id")
    .maybeSingle();

  if (queueError) {
    return {
      ok: false,
      error: "The check request could not be queued. Please retry.",
    };
  }
  if (!queued) {
    return {
      ok: false,
      error:
        "A health check is already running for this project. Wait a moment and try again.",
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return {
    ok: true,
    message:
      "Check queued — the monitoring worker will run it on its next pass. The result will appear in Automatic monitoring.",
  };
}

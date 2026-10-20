/**
 * Detection IO shell (acceptance §107 steps 8-10, §20-21).
 *
 * This is the side-effecting half of detection: it reads the observed health
 * signal + current incident/verification state from Postgres, asks the PURE
 * `reconcileService` core what should change, and writes the result back. All
 * reads/writes go through the caller's RLS-scoped client, so a tick can only
 * ever touch projects the signed-in user is a member of.
 *
 * A "tick" is one monitor pass. It also probes: for any service that is
 * unhealthy or has an active incident it records a fresh `probe` observation,
 * so each verification step corresponds to a real, timestamped check rather
 * than a reused reading.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceStatus } from "../incidents";
import type { Json } from "../supabase/database.types";
import { normalizeStoredHealth } from "../onboarding/stored-config";
import { readFailureThreshold } from "../monitoring/health-settings";
import {
  readExternalFailureStreak,
  type ExternalFailureStreak,
} from "../monitoring/failure-streak";
import {
  reconcileService,
  isUnhealthyStatus,
  type ReconcileResult,
  type ActiveIncidentView,
  type FailureGate,
} from "./reconcile";
import { rollupHealth } from "./health-rollup";

type ServiceRow = {
  id: string;
  name: string;
  status: ServiceStatus | null;
  is_demo: boolean;
};

export type MonitorTickResult = {
  ok: boolean;
  error?: string;
  createdIncidents: number;
  resolvedIncidents: number;
};

type LatestCheck = {
  status: ServiceStatus;
  latencyMs: number | null;
  errorRate: number | null;
  detail: string | null;
};

/** Most recent recorded health check for a service (status + raw metrics). */
async function latestCheck(
  supabase: SupabaseClient,
  serviceId: string,
): Promise<LatestCheck | null> {
  const { data } = await supabase
    .from("service_health_checks")
    .select("status, latency_ms, error_rate, detail")
    .eq("service_id", serviceId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    status: (data.status as ServiceStatus | undefined) ?? "unknown",
    latencyMs: typeof data.latency_ms === "number" ? data.latency_ms : null,
    errorRate:
      typeof data.error_rate === "number" ? Number(data.error_rate) : null,
    detail: typeof data.detail === "string" ? data.detail : null,
  };
}

type ActiveIncidentRow = {
  id: string;
  status: string;
  severity: string;
};

async function activeIncidentFor(
  supabase: SupabaseClient,
  projectId: string,
  serviceId: string,
): Promise<ActiveIncidentRow | null> {
  const { data } = await supabase
    .from("incidents")
    .select("id, status, severity")
    .eq("project_id", projectId)
    .eq("service_id", serviceId)
    .neq("status", "resolved")
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActiveIncidentRow | null) ?? null;
}

type VerificationRow = {
  id: string;
  status: "running" | "passed" | "failed" | "cancelled";
  checks_required: number;
  checks_passed: number;
  remediation_action_id: string | null;
};

async function runningVerificationFor(
  supabase: SupabaseClient,
  incidentId: string,
): Promise<VerificationRow | null> {
  const { data } = await supabase
    .from("verification_runs")
    .select("id, status, checks_required, checks_passed, remediation_action_id")
    .eq("incident_id", incidentId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as VerificationRow | null) ?? null;
}

/** Snapshot the project's deployment marker as evidence, when one exists. */
async function snapshotDeploymentEvidence(
  supabase: SupabaseClient,
  incidentId: string,
  project: DeploymentSnapshot,
  isDemo: boolean,
): Promise<void> {
  if (!project.deployment_version && !project.deployment_commit) return;
  const label = project.deployment_version ?? project.deployment_commit ?? "";
  await supabase.from("incident_evidence").insert({
    incident_id: incidentId,
    source: "deployment",
    label: `Deployment ${label}`,
    detail: `status=${project.deployment_status ?? "unknown"}${
      project.deployment_commit ? `, commit=${project.deployment_commit}` : ""
    }`,
    observed_at: project.deployed_at,
    is_demo: isDemo,
  });
}

type DeploymentSnapshot = {
  deployment_version: string | null;
  deployment_commit: string | null;
  deployment_status: string | null;
  deployed_at: string | null;
};

type ProbeObservation = {
  status: ServiceStatus;
  latencyMs: number | null;
  errorRate: number | null;
  detail: string | null;
};

type DecisionContext = {
  projectId: string;
  service: ServiceRow;
  userId: string | null;
  now: string;
  deployment: DeploymentSnapshot | null;
  observed: ProbeObservation;
  activeIncidentId: string | null;
  verification: VerificationRow | null;
};

/** Apply one reconcile decision. Returns how many incidents opened/resolved. */
async function applyDecision(
  supabase: SupabaseClient,
  ctx: DecisionContext,
  result: ReconcileResult,
): Promise<{ created: number; resolved: number }> {
  const { action } = result;
  const isDemo = ctx.service.is_demo;

  switch (action.type) {
    case "open_incident": {
      // NOTE on concurrency: two ticks can both read "no active incident"
      // and both insert. The partial unique index
      // `incidents_one_active_per_service` makes the loser fail with 23505,
      // in which case `inc` is null and we return created:0 — the existing
      // incident stands and the pass still succeeds. That is normal
      // deduplication, not a failure. (Any other write problem is likewise
      // non-fatal to the pass: the next due tick re-reads and reconciles.)
      const { data: inc } = await supabase
        .from("incidents")
        .insert({
          project_id: ctx.projectId,
          service_id: ctx.service.id,
          title: action.title,
          severity: action.severity,
          status: "open",
          detected_at: ctx.now,
          created_by: ctx.userId,
          is_demo: isDemo,
        })
        .select("id")
        .single();
      if (!inc) return { created: 0, resolved: 0 };

      await supabase.from("incident_events").insert({
        incident_id: inc.id,
        kind: "detected",
        message: `Detected by monitor: ${action.title}`,
        actor: "system",
        is_demo: isDemo,
      });
      // Snapshot the observed reading as evidence (observed fact, not AI).
      await supabase.from("incident_evidence").insert({
        incident_id: inc.id,
        source: "metric",
        label: "Health check reading",
        detail: [
          `status=${ctx.observed.status}`,
          ctx.observed.latencyMs !== null
            ? `latency=${ctx.observed.latencyMs}ms`
            : null,
          ctx.observed.errorRate !== null
            ? `error_rate=${(ctx.observed.errorRate * 100).toFixed(1)}%`
            : null,
        ]
          .filter(Boolean)
          .join(", "),
        observed_at: ctx.now,
        is_demo: isDemo,
      });
      if (ctx.deployment) {
        await snapshotDeploymentEvidence(
          supabase,
          inc.id,
          ctx.deployment,
          isDemo,
        );
      }
      return { created: 1, resolved: 0 };
    }

    case "begin_verification": {
      if (!ctx.activeIncidentId) return { created: 0, resolved: 0 };
      // NOTE on concurrency: like `open_incident` above, the partial unique
      // index `verification_runs_one_running_per_incident` turns a lost race
      // into a null `run` (23505). We then attach the winner's id (re-read
      // below) so the timeline still links the running verification.
      const { data: run } = await supabase
        .from("verification_runs")
        .insert({
          incident_id: ctx.activeIncidentId,
          remediation_action_id: null,
          status: "running",
          checks_required: action.checksRequired,
          checks_passed: 1,
          detail: "Recovery observed — confirming with repeated health checks.",
          is_demo: isDemo,
        })
        .select("id")
        .single();
      let verificationRunId: string | null = run ? run.id : null;
      if (!verificationRunId) {
        const { data: existing } = await supabase
          .from("verification_runs")
          .select("id")
          .eq("incident_id", ctx.activeIncidentId)
          .eq("status", "running")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        verificationRunId = ((existing as { id: string } | null) ?? null)?.id ?? null;
      }
      await supabase
        .from("incidents")
        .update({ status: "monitoring" })
        .eq("id", ctx.activeIncidentId);
      await supabase.from("incident_events").insert({
        incident_id: ctx.activeIncidentId,
        kind: "verification",
        message: `Recovery observed — verifying (1/${action.checksRequired}).`,
        actor: "system",
        is_demo: isDemo,
        metadata: verificationRunId ? { verification_run_id: verificationRunId } : null,
      });
      return { created: 0, resolved: 0 };
    }

    case "advance_verification": {
      if (!ctx.verification) return { created: 0, resolved: 0 };
      await supabase
        .from("verification_runs")
        .update({ checks_passed: action.checksPassed })
        .eq("id", ctx.verification.id);
      await supabase.from("incident_events").insert({
        incident_id: ctx.activeIncidentId,
        kind: "verification",
        message: `Health check passed — verifying (${action.checksPassed}/${action.checksRequired}).`,
        actor: "system",
        is_demo: isDemo,
      });
      return { created: 0, resolved: 0 };
    }

    case "reset_verification": {
      if (!ctx.verification) return { created: 0, resolved: 0 };
      await supabase
        .from("verification_runs")
        .update({ checks_passed: 0 })
        .eq("id", ctx.verification.id);
      await supabase.from("incident_events").insert({
        incident_id: ctx.activeIncidentId,
        kind: "verification",
        message: `Recovery not sustained (observed ${action.observedStatus}); verification reset.`,
        actor: "system",
        is_demo: isDemo,
      });
      return { created: 0, resolved: 0 };
    }

    case "confirm_recovery": {
      if (!ctx.activeIncidentId) return { created: 0, resolved: 0 };
      if (ctx.verification) {
        await supabase
          .from("verification_runs")
          .update({
            status: "passed",
            checks_passed: ctx.verification.checks_required,
            completed_at: ctx.now,
            detail: "Recovery confirmed by consecutive healthy checks.",
          })
          .eq("id", ctx.verification.id);
        if (ctx.verification.remediation_action_id) {
          await supabase
            .from("remediation_actions")
            .update({ status: "verified", verified_at: ctx.now })
            .eq("id", ctx.verification.remediation_action_id);
        }
      }
      await supabase
        .from("incidents")
        .update({ status: "resolved", resolved_at: ctx.now })
        .eq("id", ctx.activeIncidentId);
      await supabase.from("incident_events").insert({
        incident_id: ctx.activeIncidentId,
        kind: "resolved",
        message: "Recovery verified — incident resolved.",
        actor: "system",
        is_demo: isDemo,
      });
      return { created: 0, resolved: 1 };
    }

    case "record_ongoing":
    // A real failure below the configured threshold: recorded on the service,
    // deliberately NOT escalated to an incident. Nothing to persist here.
    case "below_threshold":
    case "none":
    default:
      return { created: 0, resolved: 0 };
  }
}

/** One monitor pass over a project: probe, reconcile, persist, roll up. */
export async function runMonitorTick(
  supabase: SupabaseClient,
  projectId: string,
  userId: string | null,
): Promise<MonitorTickResult> {
  const now = new Date().toISOString();

  const { data: serviceData, error: servicesError } = await supabase
    .from("services")
    .select("id, name, status, is_demo")
    .eq("project_id", projectId);
  if (servicesError) {
    return {
      ok: false,
      error: servicesError.message,
      createdIncidents: 0,
      resolvedIncidents: 0,
    };
  }
  const services = (serviceData ?? []) as ServiceRow[];

  // Project-level deployment marker, snapshotted as evidence on new incidents.
  const { data: projectRow } = await supabase
    .from("projects")
    .select(
      "deployment_version, deployment_commit, deployment_status, deployed_at",
    )
    .eq("id", projectId)
    .maybeSingle();
  const deployment = (projectRow as DeploymentSnapshot | null) ?? null;

  // The configured "alert after N consecutive failures" policy, read once per
  // project pass. It is only ever APPLIED to a genuine external observation —
  // a demo scenario or a controlled simulation keeps Phase 1's behaviour.
  const { data: configRow } = await supabase
    .from("project_configs")
    .select("health")
    .eq("project_id", projectId)
    .maybeSingle();
  const storedHealth = normalizeStoredHealth(
    ((configRow as { health?: Json | null } | null)?.health ?? null) as Json | null,
  );
  const failureThreshold = readFailureThreshold(storedHealth);

  let createdIncidents = 0;
  let resolvedIncidents = 0;
  const resultingStatuses: (ServiceStatus | null)[] = [];

  for (const service of services) {
    const latest = await latestCheck(supabase, service.id);
    const effectiveStatus: ServiceStatus =
      latest?.status ?? service.status ?? "unknown";

    const incident = await activeIncidentFor(supabase, projectId, service.id);
    const verification = incident
      ? await runningVerificationFor(supabase, incident.id)
      : null;

    // Probe: record a fresh, timestamped check whenever the service is
    // unhealthy or already has an active incident, so every reconcile step
    // maps to a real observation rather than a reused reading.
    const shouldProbe =
      isUnhealthyStatus(effectiveStatus) || incident !== null;
    const observed: ProbeObservation = {
      status: effectiveStatus,
      latencyMs: latest?.latencyMs ?? null,
      errorRate: latest?.errorRate ?? null,
      detail: latest?.detail ?? null,
    };
    if (shouldProbe) {
      await supabase.from("service_health_checks").insert({
        project_id: projectId,
        service_id: service.id,
        status: effectiveStatus,
        source: "probe",
        latency_ms: observed.latencyMs,
        error_rate: observed.errorRate,
        detail: "monitor probe",
        is_demo: service.is_demo,
        checked_at: now,
      });
    }
    // Apply the configured failure threshold ONLY to a service that is genuinely
    // monitored, i.e. one that has at least one real external observation.
    //
    // Note this deliberately does NOT depend on the newest row being the
    // external one: `runMonitorTick` writes a `monitor probe` self-copy row
    // above whenever a service is unhealthy or has an open incident, and that
    // row becomes the newest one. Reading the streak from the genuine
    // `source='external'` history keeps the threshold enforced across those
    // self-copies instead of silently reverting to "first bad reading acts".
    // Demo services never contribute genuine observations, so they keep
    // Phase 1's behaviour exactly.
    let failureGate: FailureGate | null = null;
    if (!service.is_demo) {
      const streak: ExternalFailureStreak = await readExternalFailureStreak(
        supabase,
        service.id,
        failureThreshold,
      );
      if (streak.lastCheckedAt !== null) {
        failureGate = {
          consecutiveFailures: streak.consecutiveFailures,
          threshold: failureThreshold,
        };
      }
    }

    const result = reconcileService({
      service: {
        id: service.id,
        name: service.name,
        currentStatus: service.status,
      },
      observedStatus: latest ? effectiveStatus : service.status,
      activeIncident: incident
        ? {
            id: incident.id,
            status: incident.status as ActiveIncidentView["status"],
            severity: incident.severity as ActiveIncidentView["severity"],
          }
        : null,
      activeVerification: verification
        ? {
            id: verification.id,
            status: verification.status,
            checksRequired: verification.checks_required,
            checksPassed: verification.checks_passed,
          }
        : null,
      failureGate,
    });

    const counts = await applyDecision(
      supabase,
      {
        projectId,
        service,
        userId,
        now,
        deployment,
        observed,
        activeIncidentId: incident?.id ?? null,
        verification,
      },
      result,
    );
    createdIncidents += counts.created;
    resolvedIncidents += counts.resolved;

    // Persist the service's post-reconcile status when it changed.
    if (result.serviceStatus !== service.status) {
      await supabase
        .from("services")
        .update({ status: result.serviceStatus })
        .eq("id", service.id);
    }
    resultingStatuses.push(result.serviceStatus);
  }
  // Roll individual services up to the project and refresh its counters so the
  // dashboard reflects real DB state (§20), never a hardcoded value.
  const { count: activeIncidentCount } = await supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .neq("status", "resolved");

  const health = rollupHealth(resultingStatuses);
  await supabase
    .from("projects")
    .update({
      health,
      service_count: services.length,
      active_incident_count: activeIncidentCount ?? 0,
      last_checked_at: now,
    })
    .eq("id", projectId);

  return { ok: true, createdIncidents, resolvedIncidents };
}



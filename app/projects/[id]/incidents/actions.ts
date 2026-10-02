"use server";

/**
 * Server actions that drive the operational workflow (acceptance §107):
 * controlled failure → detection → analysis → human approval → remediation →
 * verification → resolution.
 *
 * Every action goes through the RLS-scoped anon client and re-verifies the
 * caller's identity with auth.getUser(). A project/incident id in the URL is
 * NEVER sufficient by itself: RLS (can_access_project / can_access_incident)
 * scopes every read and write, so an id belonging to another tenant simply
 * returns no rows — authorization is enforced in the database, not here.
 *
 * The AI is read-only: it can only ever *propose*. No action here executes a
 * remediation that is not already status='approved' (human approval — §14),
 * and the engine only applies typed, allowlisted actions against demo state.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { runMonitorTick } from "@/lib/detection/monitor";
import { generateIncidentAnalysis } from "@/lib/ai/analyze-incident";
import { applyRemediation } from "@/lib/remediation/engine";

export type ActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  incidentId?: string;
};

type Authed = { supabase: SupabaseClient; userId: string };

/** Resolve the RLS-scoped client + verified user, or an honest error. Exported
 *  for the health-check action so both operations share one auth path. */
export async function authed(): Promise<
  { ok: true; ctx: Authed } | { ok: false; error: string }
> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return {
      ok: false,
      error: "Authentication isn't configured. Add the Supabase keys to .env.local.",
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired — please sign in again." };
  }
  return { ok: true, ctx: { supabase, userId: user.id } };
}

/** Demo controls only exist outside production, mirroring /api/dev/seed. */
function devOnlyGuard(): ActionResult | null {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Demo controls are disabled in production." };
  }
  return null;
}

/** Confirm the caller can see this project (RLS). Returns false if not. Shared
 *  with the health-check action so both operations share one access check. */
export async function canSeeProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  return Boolean(data);
}

/** Resolve an incident to its project (RLS-scoped) for access + revalidation. */
async function incidentProject(
  supabase: SupabaseClient,
  incidentId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("incidents")
    .select("project_id")
    .eq("id", incidentId)
    .maybeSingle();
  return (data?.project_id as string | undefined) ?? null;
}

/** Revalidate the dashboard + incident + report views after a change. */
function revalidateIncident(projectId: string, incidentId?: string): void {
  revalidatePath(`/projects/${projectId}`);
  if (incidentId) {
    revalidatePath(`/projects/${projectId}/incidents/${incidentId}`);
    revalidatePath(`/projects/${projectId}/incidents/${incidentId}/report`);
  }
}

// ===========================================================================
// Demo scenario (§4, §7) — a coherent, clearly-labelled controlled setup.
// All rows carry is_demo = true. Nothing here is presented as real telemetry.
// ===========================================================================

/** The demo service the controlled failure targets. */
const FAILING_SERVICE = "api";

const DEMO_SERVICES: {
  name: string;
  kind: string;
  description: string;
  latencyMs: number;
  errorRate: number;
}[] = [
  {
    name: "web",
    kind: "frontend",
    description: "Customer-facing web application (Next.js).",
    latencyMs: 82,
    errorRate: 0.002,
  },
  {
    name: "api",
    kind: "backend",
    description: "Core REST API service.",
    latencyMs: 124,
    errorRate: 0.004,
  },
  {
    name: "database",
    kind: "database",
    description: "Primary PostgreSQL database.",
    latencyMs: 28,
    errorRate: 0,
  },
];

/**
 * Create the three demo services (web/api/database) in a project, all starting
 * healthy with a baseline health check, plus a known-good deployment marker.
 * Idempotent: services already present are left untouched. Dev-only.
 */
export async function setupDemoScenario(projectId: string): Promise<ActionResult> {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  if (!(await canSeeProject(supabase, projectId))) {
    return { ok: false, error: "Project not found." };
  }

  const { data: existingRows } = await supabase
    .from("services")
    .select("id, name")
    .eq("project_id", projectId);
  const existing = new Map(
    ((existingRows as { id: string; name: string }[] | null) ?? []).map((s) => [
      s.name,
      s.id,
    ]),
  );

  const now = Date.now();
  for (const svc of DEMO_SERVICES) {
    if (existing.has(svc.name)) continue;
    const { data: created, error } = await supabase
      .from("services")
      .insert({
        project_id: projectId,
        name: svc.name,
        kind: svc.kind,
        status: "healthy",
        description: svc.description,
        is_demo: true,
      })
      .select("id")
      .single();
    if (error || !created) {
      return {
        ok: false,
        error:
          "Couldn't create the demo services. Apply the latest migration (supabase db push), then retry.",
      };
    }
    await supabase.from("service_health_checks").insert({
      project_id: projectId,
      service_id: created.id,
      status: "healthy",
      source: "synthetic",
      latency_ms: svc.latencyMs,
      error_rate: svc.errorRate,
      detail: "Baseline demo health check.",
      is_demo: true,
      checked_at: new Date(now).toISOString(),
    });
  }

  // Known-good deployment marker (baseline), well before any failure.
  await supabase
    .from("projects")
    .update({
      deployment_version: "v2.4.0",
      deployment_commit: "a1b2c3d",
      deployment_status: "success",
      deployed_at: new Date(now - 3 * 86_400_000).toISOString(),
    })
    .eq("id", projectId);

  await runMonitorTick(supabase, projectId, userId);
  revalidateIncident(projectId);
  return {
    ok: true,
    message: "Demo services are set up and healthy. You can now simulate a controlled failure.",
  };
}

/**
 * Record a CONTROLLED FAILURE signal on the demo `api` service and let the
 * detector observe it. This writes an unhealthy OBSERVATION (a simulation
 * health check) and a correlated deployment marker — it does NOT create an
 * incident. runMonitorTick then independently observes the signal and decides
 * to open one, preserving OBSERVE → DETECT (never BUTTON → INCIDENT). Dev-only.
 */
export async function simulateControlledFailure(
  projectId: string,
): Promise<ActionResult> {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  if (!(await canSeeProject(supabase, projectId))) {
    return { ok: false, error: "Project not found." };
  }

  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", FAILING_SERVICE)
    .eq("is_demo", true)
    .maybeSingle();
  if (!svc) {
    return {
      ok: false,
      error: 'Set up the demo services first, then simulate the "' + FAILING_SERVICE + '" failure.',
    };
  }

  const now = Date.now();
  // A new deployment landed shortly before the failure — a candidate cause the
  // AI will flag WITHOUT asserting causation. Set it before the detector reads.
  await supabase
    .from("projects")
    .update({
      deployment_version: "v2.4.1",
      deployment_commit: "9f3c2a1",
      deployment_status: "success",
      deployed_at: new Date(now - 2 * 60_000).toISOString(),
    })
    .eq("id", projectId);

  // The observed unhealthy signal. source='simulation' so it is never mistaken
  // for a real probe. The detector reads this on the next tick.
  await supabase.from("service_health_checks").insert({
    project_id: projectId,
    service_id: svc.id,
    status: "critical",
    source: "simulation",
    latency_ms: 1240,
    error_rate: 0.46,
    detail: "Controlled simulation: API returning 5xx; upstream database timeouts.",
    is_demo: true,
    checked_at: new Date(now).toISOString(),
  });

  const tick = await runMonitorTick(supabase, projectId, userId);
  if (!tick.ok) {
    return { ok: false, error: "Detection pass failed. Check the database migration." };
  }

  const incidentId = await activeIncidentOnService(supabase, projectId, svc.id);
  revalidateIncident(projectId, incidentId ?? undefined);
  return {
    ok: true,
    incidentId: incidentId ?? undefined,
    message: tick.createdIncidents > 0
      ? "Controlled failure recorded — the detector observed it and opened an incident."
      : "Controlled failure recorded — the detector observed it (an incident was already open).",
  };
}

/** Most recent active incident on a service (RLS-scoped), for navigation.
 *  Shared with the health-check action. */
export async function activeIncidentOnService(
  supabase: SupabaseClient,
  projectId: string,
  serviceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("incidents")
    .select("id")
    .eq("project_id", projectId)
    .eq("service_id", serviceId)
    .neq("status", "resolved")
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ===========================================================================
// Core workflow (§8 detection, §11-13 analysis, §14 approval, §15-17
// remediation + verification). These act on real incident rows in any
// environment; RLS scopes every operation to the caller's own data.
// ===========================================================================

/** Run one detection pass over the project (OBSERVE → DETECT / verify). */
export async function runProjectMonitor(projectId: string): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  if (!(await canSeeProject(supabase, projectId))) {
    return { ok: false, error: "Project not found." };
  }

  const tick = await runMonitorTick(supabase, projectId, userId);
  if (!tick.ok) {
    return { ok: false, error: "Detection pass failed. Check the database migration." };
  }
  revalidateIncident(projectId);
  const parts: string[] = [];
  if (tick.createdIncidents > 0) parts.push(`${tick.createdIncidents} opened`);
  if (tick.resolvedIncidents > 0) parts.push(`${tick.resolvedIncidents} resolved`);
  return {
    ok: true,
    message: parts.length > 0 ? `Monitor check complete — ${parts.join(", ")}.` : "Monitor check complete — no change.",
  };
}

/** Generate (or refresh) the read-only AI analysis for an incident (§11-13). */
export async function generateAnalysis(incidentId: string): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  const projectId = await incidentProject(supabase, incidentId);
  if (!projectId) return { ok: false, error: "Incident not found." };

  const result = await generateIncidentAnalysis(supabase, incidentId, userId);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Analysis could not be generated." };
  }
  revalidateIncident(projectId, incidentId);
  return {
    ok: true,
    incidentId,
    message:
      (result.proposedCount ?? 0) > 0
        ? `Analysis ready (${result.provider}). ${result.proposedCount} remediation(s) proposed for your review.`
        : `Analysis ready (${result.provider}). No automatic remediation was proposed.`,
  };
}

type RemediationRow = {
  id: string;
  incident_id: string;
  status: string;
  action_type: string | null;
  title: string | null;
};

/** Load a remediation the caller may access (RLS via can_access_incident). */
async function loadRemediation(
  supabase: SupabaseClient,
  remediationId: string,
): Promise<RemediationRow | null> {
  const { data } = await supabase
    .from("remediation_actions")
    .select("id, incident_id, status, action_type, title")
    .eq("id", remediationId)
    .maybeSingle();
  return (data as RemediationRow | null) ?? null;
}

/** Approve a PROPOSED remediation (human gate — §14). Never executes it. */
export async function approveRemediation(remediationId: string): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  const action = await loadRemediation(supabase, remediationId);
  if (!action) return { ok: false, error: "Remediation not found." };
  if (action.status !== "proposed") {
    return { ok: false, error: `This action is "${action.status}" and can no longer be approved.` };
  }
  const projectId = await incidentProject(supabase, action.incident_id);

  await supabase
    .from("remediation_actions")
    .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", remediationId);
  await supabase.from("incident_events").insert({
    incident_id: action.incident_id,
    kind: "remediation_approved",
    message: `Approved by operator: ${action.title ?? "remediation"}. Ready to execute.`,
    actor: "user",
    metadata: { remediation_action_id: remediationId },
  });
  if (projectId) revalidateIncident(projectId, action.incident_id);
  return { ok: true, incidentId: action.incident_id, message: "Approved. Execute when ready." };
}

/** Reject a PROPOSED remediation. It becomes non-executable. */
export async function rejectRemediation(remediationId: string): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase } = auth.ctx;

  const action = await loadRemediation(supabase, remediationId);
  if (!action) return { ok: false, error: "Remediation not found." };
  if (action.status !== "proposed") {
    return { ok: false, error: `This action is "${action.status}" and can no longer be rejected.` };
  }
  const projectId = await incidentProject(supabase, action.incident_id);

  await supabase
    .from("remediation_actions")
    .update({ status: "rejected", result: "Rejected by operator." })
    .eq("id", remediationId);
  await supabase.from("incident_events").insert({
    incident_id: action.incident_id,
    kind: "remediation_rejected",
    message: `Rejected by operator: ${action.title ?? "remediation"}.`,
    actor: "user",
    metadata: { remediation_action_id: remediationId },
  });
  if (projectId) revalidateIncident(projectId, action.incident_id);
  return { ok: true, incidentId: action.incident_id, message: "Remediation rejected." };
}

/**
 * Execute an APPROVED remediation, then run one detection pass so verification
 * begins immediately. The engine refuses anything not status='approved' and
 * only applies typed, allowlisted actions against demo state (§15-16). Applying
 * a fix does not resolve the incident — recovery is confirmed by the detector
 * observing consecutive healthy checks (§17-18).
 */
export async function executeRemediation(remediationId: string): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  const action = await loadRemediation(supabase, remediationId);
  if (!action) return { ok: false, error: "Remediation not found." };
  if (action.status !== "approved") {
    return { ok: false, error: `This action is "${action.status}" — approve it before executing.` };
  }
  const projectId = await incidentProject(supabase, action.incident_id);

  const outcome = await applyRemediation(supabase, remediationId);
  // Kick a detection pass so verification advances from the fresh observation.
  if (projectId) await runMonitorTick(supabase, projectId, userId);
  if (projectId) revalidateIncident(projectId, action.incident_id);

  if (!outcome.ok) {
    return { ok: false, incidentId: action.incident_id, error: outcome.error ?? "Execution failed." };
  }
  return {
    ok: true,
    incidentId: action.incident_id,
    message: "Executed. Verifying recovery with repeated health checks — this is not marked resolved until verification passes.",
  };
}


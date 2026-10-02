/**
 * Remediation execution engine (acceptance §107 steps 14-17).
 *
 * The ONLY code path that applies a remediation. It is deliberately narrow:
 *   - it refuses to run anything whose row is not already status='approved'
 *     (human approval is mandatory — §14; the AI is read-only),
 *   - it refuses any action_type not on the closed allowlist
 *     (requireRemediationSpec throws — there is no arbitrary-command path, §15),
 *   - it only ever touches demo/simulated state: it writes an observed health
 *     signal or flips the demo deployment marker; it never runs a shell command
 *     or acts on real infrastructure (§15-16).
 *
 * Applying a fix does NOT resolve the incident. For actions expected to restore
 * health it moves the incident to 'monitoring' and opens a verification_run;
 * recovery is only confirmed later by the detector observing consecutive
 * healthy checks (§17-18). RETRY_HEALTH_CHECK merely re-probes and claims
 * nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceStatus } from "../incidents";
import { requireRemediationSpec, type RemediationSpec } from "./actions";
import { DEFAULT_VERIFICATION_CHECKS } from "../detection/reconcile";

export type RemediationOutcome = {
  ok: boolean;
  status: "applied" | "failed";
  error?: string;
  verificationRunId?: string | null;
};

type ActionRow = {
  id: string;
  incident_id: string;
  action_type: string | null;
  status: string;
  is_demo: boolean;
  title: string | null;
};

type IncidentRow = {
  id: string;
  project_id: string;
  service_id: string | null;
};

async function currentServiceStatus(
  supabase: SupabaseClient,
  serviceId: string,
): Promise<ServiceStatus> {
  const { data } = await supabase
    .from("service_health_checks")
    .select("status")
    .eq("service_id", serviceId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.status as ServiceStatus | undefined) ?? "unknown";
}

/** Record an observed health check — the honest signal the detector reads. */
async function recordCheck(
  supabase: SupabaseClient,
  incident: IncidentRow,
  status: ServiceStatus,
  source: "probe" | "simulation",
  detail: string,
  isDemo: boolean,
): Promise<void> {
  if (!incident.service_id) return;
  await supabase.from("service_health_checks").insert({
    project_id: incident.project_id,
    service_id: incident.service_id,
    status,
    source,
    detail,
    is_demo: isDemo,
  });
}

/** Execute one APPROVED, allowlisted remediation against demo state. */
export async function applyRemediation(
  supabase: SupabaseClient,
  remediationActionId: string,
): Promise<RemediationOutcome> {
  const { data: actionData } = await supabase
    .from("remediation_actions")
    .select("id, incident_id, action_type, status, is_demo, title")
    .eq("id", remediationActionId)
    .maybeSingle();
  const action = (actionData as ActionRow | null) ?? null;
  if (!action) {
    return { ok: false, status: "failed", error: "Remediation not found." };
  }

  // Human approval is mandatory: never execute a row that is not approved.
  if (action.status !== "approved") {
    return {
      ok: false,
      status: "failed",
      error: `Remediation is "${action.status}", not "approved" — cannot execute.`,
    };
  }

  // Allowlist choke point: an unknown/absent type throws, and we fail closed.
  let spec: RemediationSpec;
  try {
    spec = requireRemediationSpec(action.action_type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not allowlisted.";
    await markFailed(supabase, action, message);
    return { ok: false, status: "failed", error: message };
  }

  const { data: incidentData } = await supabase
    .from("incidents")
    .select("id, project_id, service_id")
    .eq("id", action.incident_id)
    .maybeSingle();
  const incident = (incidentData as IncidentRow | null) ?? null;
  if (!incident) {
    await markFailed(supabase, action, "Incident not found.");
    return { ok: false, status: "failed", error: "Incident not found." };
  }

  const isDemo = action.is_demo;
  let resultText: string;

  // Apply the effect. Demo/simulated state only — never real infra, never shell.
  switch (spec.type) {
    case "RESTART_DEMO_SERVICE": {
      await recordCheck(
        supabase,
        incident,
        "healthy",
        "simulation",
        "Simulated service restart — health check now reports healthy.",
        isDemo,
      );
      resultText =
        "Restarted the simulated service; a healthy check was recorded. Awaiting verification.";
      break;
    }
    case "ROLLBACK_DEMO_DEPLOYMENT": {
      await supabase
        .from("projects")
        .update({ deployment_status: "success" })
        .eq("id", incident.project_id);
      await recordCheck(
        supabase,
        incident,
        "healthy",
        "simulation",
        "Rolled back demo deployment — health check now reports healthy.",
        isDemo,
      );
      resultText =
        "Rolled back the demo deployment marker to a good state; a healthy check was recorded. Awaiting verification.";
      break;
    }
    case "RETRY_HEALTH_CHECK": {
      // A pure re-check restores nothing: re-probe and report, change no state.
      const observed = incident.service_id
        ? await currentServiceStatus(supabase, incident.service_id)
        : "unknown";
      await recordCheck(
        supabase,
        incident,
        observed,
        "probe",
        "Manual re-check requested from remediation.",
        isDemo,
      );
      resultText = `Re-ran the health check; the service currently reports "${observed}". No change was made.`;
      await supabase
        .from("remediation_actions")
        .update({
          status: "applied",
          applied_at: new Date().toISOString(),
          result: resultText,
        })
        .eq("id", action.id);
      await supabase.from("incident_events").insert({
        incident_id: action.incident_id,
        kind: "remediation_applied",
        message: `Executed: ${spec.title}. ${resultText}`,
        actor: "system",
        is_demo: isDemo,
      });
      return { ok: true, status: "applied", verificationRunId: null };
    }
    default: {
      await markFailed(supabase, action, "Unhandled action type.");
      return { ok: false, status: "failed", error: "Unhandled action type." };
    }
  }

  // restoresHealth actions: mark applied, move to monitoring, open verification.
  const now = new Date().toISOString();
  await supabase
    .from("remediation_actions")
    .update({ status: "applied", applied_at: now, result: resultText })
    .eq("id", action.id);
  await supabase
    .from("incidents")
    .update({ status: "monitoring" })
    .eq("id", action.incident_id);

  const { data: run } = await supabase
    .from("verification_runs")
    .insert({
      incident_id: action.incident_id,
      remediation_action_id: action.id,
      status: "running",
      checks_required: DEFAULT_VERIFICATION_CHECKS,
      checks_passed: 0,
      detail:
        "Verifying recovery after remediation — awaiting consecutive healthy checks.",
      is_demo: isDemo,
    })
    .select("id")
    .single();

  await supabase.from("incident_events").insert([
    {
      incident_id: action.incident_id,
      kind: "remediation_applied",
      message: `Executed: ${spec.title}. ${resultText}`,
      actor: "system",
      is_demo: isDemo,
      metadata: run ? { verification_run_id: run.id } : null,
    },
    {
      incident_id: action.incident_id,
      kind: "verification",
      message: `Verification started — need ${DEFAULT_VERIFICATION_CHECKS} consecutive healthy checks to confirm recovery.`,
      actor: "system",
      is_demo: isDemo,
    },
  ]);

  return { ok: true, status: "applied", verificationRunId: run?.id ?? null };
}

/** Mark a remediation failed and note it on the timeline (never throws). */
async function markFailed(
  supabase: SupabaseClient,
  action: ActionRow,
  message: string,
): Promise<void> {
  await supabase
    .from("remediation_actions")
    .update({ status: "failed", result: message })
    .eq("id", action.id);
  await supabase.from("incident_events").insert({
    incident_id: action.incident_id,
    kind: "note",
    message: `Remediation could not be executed: ${message}`,
    actor: "system",
    is_demo: action.is_demo,
  });
}

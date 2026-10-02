/**
 * Shared server-side loader for a single incident and everything attached to it
 * (§6, §19). The incident detail page, the printable report, and the JSON
 * export route all read through this one function so they can never drift into
 * showing different "truths" for the same incident.
 *
 * Authorization is NOT re-implemented here: every query runs through the
 * caller's RLS-scoped Supabase client, so a project id alone can never reach
 * another user's incident. We still assert `project_id` matches the URL to
 * return a clean 404 rather than leaking existence across projects.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveLifecyclePhase,
  toAiAnalysis,
  toIncident,
  toIncidentEvent,
  toIncidentEvidence,
  toRemediationAction,
  toService,
  toServiceHealthCheck,
  toVerificationRun,
  type AiAnalysisRecord,
  type Incident,
  type IncidentEvent,
  type IncidentEvidence,
  type IncidentLifecyclePhase,
  type RemediationAction,
  type Service,
  type ServiceHealthCheck,
  type VerificationRun,
} from "@/lib/incidents";

const INCIDENT_COLUMNS =
  "id, project_id, service_id, title, summary, severity, status, detected_at, resolved_at, is_demo";
const SERVICE_COLUMNS = "id, name, kind, status, description, is_demo";
const EVENT_COLUMNS = "id, at, kind, message, actor, metadata, is_demo";
const EVIDENCE_COLUMNS =
  "id, source, label, detail, observed_at, metadata, is_demo, created_at";
const ANALYSIS_COLUMNS =
  "id, provider, model, observation, interpretation, confidence, confidence_rationale, suggested_action, evidence_refs, disclaimer, is_demo, created_at";
const REMEDIATION_COLUMNS =
  "id, ai_analysis_id, title, description, proposed_by, command, risk, status, requires_approval, approved_at, applied_at, verified_at, result, is_demo, created_at";
const VERIFICATION_COLUMNS =
  "id, remediation_action_id, status, checks_required, checks_passed, detail, is_demo, started_at, completed_at";
const HEALTHCHECK_COLUMNS =
  "id, service_id, status, source, latency_ms, error_rate, detail, is_demo, checked_at";

export type IncidentProject = {
  id: string;
  name: string;
  slug: string | null;
  isDemo: boolean;
};

/** Everything the detail page / report needs about one incident. */
export type IncidentBundle = {
  incident: Incident;
  project: IncidentProject | null;
  service: Service | null;
  /** Non-deployment evidence, grouped for display. */
  evidence: IncidentEvidence[];
  /** Deployment-source evidence — "related changes" (correlation, not cause). */
  relatedChanges: IncidentEvidence[];
  events: IncidentEvent[];
  analysis: AiAnalysisRecord | null;
  remediations: RemediationAction[];
  verifications: VerificationRun[];
  checks: ServiceHealthCheck[];
  phase: IncidentLifecyclePhase;
};

export type LoadIncidentResult =
  | { ok: true; bundle: IncidentBundle }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "schema_missing" | "error"; message: string };

function present<T>(value: T | null): value is T {
  return value !== null;
}

function toList<T>(data: unknown, narrow: (row: unknown) => T | null): T[] {
  return ((data as unknown[]) ?? []).map(narrow).filter(present);
}

/**
 * Load one incident (scoped to `projectId`) and all attached records through
 * the caller's RLS-scoped client. Returns a discriminated result so callers can
 * map cleanly to a 404, a "run the migration" notice, or a generic error.
 */
export async function loadIncidentBundle(
  supabase: SupabaseClient,
  projectId: string,
  incidentId: string,
): Promise<LoadIncidentResult> {
  const { data: incidentRow, error: incidentError } = await supabase
    .from("incidents")
    .select(INCIDENT_COLUMNS)
    .eq("id", incidentId)
    .maybeSingle();

  if (incidentError) {
    return {
      ok: false,
      reason: "schema_missing",
      message: incidentError.message,
    };
  }
  if (!incidentRow) return { ok: false, reason: "not_found" };

  const incident = toIncident(incidentRow);
  const rowProjectId = String(
    (incidentRow as Record<string, unknown>).project_id ?? "",
  );
  if (!incident || rowProjectId !== projectId) {
    return { ok: false, reason: "not_found" };
  }

  const optional = Promise.resolve({ data: null, error: null });
  const [
    projectRes,
    serviceRes,
    eventsRes,
    evidenceRes,
    analysisRes,
    remediationRes,
    verificationRes,
    checksRes,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, slug, is_demo")
      .eq("id", projectId)
      .maybeSingle(),
    incident.serviceId
      ? supabase
          .from("services")
          .select(SERVICE_COLUMNS)
          .eq("id", incident.serviceId)
          .maybeSingle()
      : optional,
    supabase
      .from("incident_events")
      .select(EVENT_COLUMNS)
      .eq("incident_id", incident.id)
      .order("at", { ascending: true }),
    supabase
      .from("incident_evidence")
      .select(EVIDENCE_COLUMNS)
      .eq("incident_id", incident.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_analyses")
      .select(ANALYSIS_COLUMNS)
      .eq("incident_id", incident.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("remediation_actions")
      .select(REMEDIATION_COLUMNS)
      .eq("incident_id", incident.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("verification_runs")
      .select(VERIFICATION_COLUMNS)
      .eq("incident_id", incident.id)
      .order("started_at", { ascending: false }),
    incident.serviceId
      ? supabase
          .from("service_health_checks")
          .select(HEALTHCHECK_COLUMNS)
          .eq("service_id", incident.serviceId)
          .order("checked_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const projectRow = (projectRes.data ?? null) as {
    id?: string;
    name?: string;
    slug?: string | null;
    is_demo?: boolean;
  } | null;
  const project: IncidentProject | null = projectRow
    ? {
        id: String(projectRow.id ?? projectId),
        name:
          typeof projectRow.name === "string" && projectRow.name.trim()
            ? projectRow.name.trim()
            : "Project",
        slug: typeof projectRow.slug === "string" ? projectRow.slug : null,
        isDemo: projectRow.is_demo === true,
      }
    : null;

  const service = serviceRes.data ? toService(serviceRes.data) : null;
  const events = toList(eventsRes.data, toIncidentEvent);
  const allEvidence = toList(evidenceRes.data, toIncidentEvidence);
  const analysis = analysisRes.data ? toAiAnalysis(analysisRes.data) : null;
  const remediations = toList(remediationRes.data, toRemediationAction);
  const verifications = toList(verificationRes.data, toVerificationRun);
  const checks = toList(checksRes.data, toServiceHealthCheck);

  const relatedChanges = allEvidence.filter((e) => e.source === "deployment");
  const evidence = allEvidence.filter((e) => e.source !== "deployment");
  const remediationApplied = remediations.some(
    (r) => r.status === "applied" || r.status === "verified",
  );
  const verificationRunning = verifications.some((v) => v.status === "running");
  const phase = deriveLifecyclePhase(incident.status, {
    remediationApplied,
    verificationRunning,
  });

  return {
    ok: true,
    bundle: {
      incident,
      project,
      service,
      evidence,
      relatedChanges,
      events,
      analysis,
      remediations,
      verifications,
      checks,
      phase,
    },
  };
}

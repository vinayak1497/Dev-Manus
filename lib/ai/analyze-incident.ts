/**
 * Server-side incident analysis (acceptance §107 steps 11-13).
 *
 * Gathers the REAL structured evidence already stored for an incident, hands it
 * to the provider chain (a live model when a key is configured, else the honest
 * deterministic provider), stores the validated result as an ai_analyses row,
 * and turns any typed, allowlisted suggestions into *proposed* remediation
 * actions. Nothing here executes a fix — the AI is read-only and every action
 * stays status='proposed' until a human approves it (§14). The provider only
 * ever sees the evidence gathered below; it is never handed free-form context,
 * so it cannot invent logs, metrics, or deployments (§13).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeIncident } from "./index";
import type { IncidentAnalysisInput } from "./types";
import { isAllowedRemediation } from "../remediation/actions";

export type GenerateAnalysisResult = {
  ok: boolean;
  error?: string;
  analysisId?: string;
  provider?: string;
  usedFallback?: boolean;
  proposedCount?: number;
};

type IncidentJoin = {
  id: string;
  project_id: string;
  service_id: string | null;
  title: string;
  severity: string;
  status: string;
  detected_at: string;
  is_demo: boolean;
};

type EvidenceRow = {
  source: string;
  label: string;
  detail: string | null;
  observed_at: string | null;
};
type EventRow = { at: string; kind: string; message: string; actor: string };
type CheckRow = {
  status: string;
  latency_ms: number | null;
  error_rate: number | null;
  checked_at: string;
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Analyze one incident from its stored evidence and propose typed actions. */
export async function generateIncidentAnalysis(
  supabase: SupabaseClient,
  incidentId: string,
  userId: string | null,
): Promise<GenerateAnalysisResult> {
  const { data: incidentData } = await supabase
    .from("incidents")
    .select(
      "id, project_id, service_id, title, severity, status, detected_at, is_demo",
    )
    .eq("id", incidentId)
    .maybeSingle();
  const incident = (incidentData as IncidentJoin | null) ?? null;
  if (!incident) return { ok: false, error: "Incident not found." };

  const { data: serviceData } = incident.service_id
    ? await supabase
        .from("services")
        .select("name, status")
        .eq("id", incident.service_id)
        .maybeSingle()
    : { data: null };
  const service = serviceData as { name: string; status: string | null } | null;

  const { data: projectData } = await supabase
    .from("projects")
    .select(
      "environment, deployment_version, deployment_commit, deployment_status, deployed_at",
    )
    .eq("id", incident.project_id)
    .maybeSingle();
  const project = projectData as {
    environment: string | null;
    deployment_version: string | null;
    deployment_commit: string | null;
    deployment_status: string | null;
    deployed_at: string | null;
  } | null;

  const { data: evidenceData } = await supabase
    .from("incident_evidence")
    .select("source, label, detail, observed_at")
    .eq("incident_id", incidentId)
    .order("observed_at", { ascending: true });

  const { data: eventData } = await supabase
    .from("incident_events")
    .select("at, kind, message, actor")
    .eq("incident_id", incidentId)
    .order("at", { ascending: true });

  const { data: checkData } = incident.service_id
    ? await supabase
        .from("service_health_checks")
        .select("status, latency_ms, error_rate, checked_at")
        .eq("service_id", incident.service_id)
        .order("checked_at", { ascending: false })
        .limit(10)
    : { data: null };

  // __ANALYZE_INPUT__
  const serviceName = service?.name ?? null;
  const input: IncidentAnalysisInput = {
    incident: {
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      detectedAt: incident.detected_at,
      serviceName,
      environment: project?.environment ?? null,
    },
    evidence: ((evidenceData as EvidenceRow[] | null) ?? []).map((e) => ({
      source: e.source,
      label: e.label,
      detail: e.detail ?? null,
      observedAt: e.observed_at ?? null,
    })),
    timeline: ((eventData as EventRow[] | null) ?? []).map((e) => ({
      at: e.at,
      kind: e.kind,
      message: e.message,
      actor: e.actor,
    })),
    // Oldest-first so the provider reads the readings in the order observed.
    healthChecks: ((checkData as CheckRow[] | null) ?? [])
      .slice()
      .reverse()
      .map((c) => ({
        status: c.status,
        latencyMs: numOrNull(c.latency_ms),
        errorRate: numOrNull(c.error_rate),
        checkedAt: c.checked_at,
      })),
    deployment:
      project && (project.deployment_version || project.deployment_commit)
        ? {
            version: project.deployment_version ?? null,
            commit: project.deployment_commit ?? null,
            status: project.deployment_status ?? null,
            deployedAt: project.deployed_at ?? null,
          }
        : null,
    serviceState: serviceName
      ? { name: serviceName, status: service?.status ?? null }
      : null,
  };

  const { analysis, provider, usedFallback } = await analyzeIncident(input);

  // __ANALYZE_STORE__
  // Persist the validated analysis. We never store or render raw model JSON as
  // fact: it lands in a typed row with an explicit confidence + disclaimer.
  const topSuggestion = analysis.suggestedActions[0]?.title ?? null;
  const { data: stored } = await supabase
    .from("ai_analyses")
    .insert({
      incident_id: incidentId,
      provider,
      observation: analysis.observation,
      interpretation: analysis.interpretation,
      confidence: analysis.confidence,
      suggested_action: topSuggestion,
      evidence_refs: analysis.evidence,
      raw: analysis,
      created_by: userId,
      is_demo: incident.is_demo,
    })
    .select("id")
    .single();
  const analysisId = (stored as { id: string } | null)?.id ?? undefined;

  await supabase.from("incident_events").insert({
    incident_id: incidentId,
    kind: "ai_analysis",
    message: analysis.insufficientEvidence
      ? "AI reported insufficient evidence to determine a cause."
      : `AI analysis generated (confidence: ${analysis.confidence}).`,
    actor: "ai",
    is_demo: incident.is_demo,
    metadata: analysisId ? { ai_analysis_id: analysisId } : null,
  });

  // __ANALYZE_PROPOSE__
  // Existing actions (any not rejected/failed) so re-analysis never duplicates.
  const { data: existingActions } = await supabase
    .from("remediation_actions")
    .select("action_type, status")
    .eq("incident_id", incidentId);
  const existingTypes = new Set(
    ((existingActions as { action_type: string | null; status: string }[] | null) ??
      [])
      .filter((r) => r.status !== "rejected" && r.status !== "failed")
      .map((r) => r.action_type)
      .filter((t): t is string => Boolean(t)),
  );

  // Turn ONLY typed, allowlisted suggestions into *proposed* remediations.
  // Advisory suggestions without a mapped action stay informational (shown in
  // the AI panel) and never become an executable, approvable action.
  let proposedCount = 0;
  for (const s of analysis.suggestedActions) {
    if (!isAllowedRemediation(s.actionType)) continue;
    if (existingTypes.has(s.actionType)) continue;
    const { data: ra } = await supabase
      .from("remediation_actions")
      .insert({
        incident_id: incidentId,
        ai_analysis_id: analysisId ?? null,
        title: s.title,
        description: s.description,
        proposed_by: "ai",
        risk: s.risk,
        status: "proposed",
        requires_approval: true,
        action_type: s.actionType,
        is_demo: incident.is_demo,
      })
      .select("id")
      .single();
    if (!ra) continue;
    proposedCount += 1;
    existingTypes.add(s.actionType);
    await supabase.from("incident_events").insert({
      incident_id: incidentId,
      kind: "remediation_proposed",
      message: `Proposed remediation: ${s.title} (risk: ${s.risk}). Requires human approval.`,
      actor: "ai",
      is_demo: incident.is_demo,
      metadata: {
        remediation_action_id: (ra as { id: string }).id,
        action_type: s.actionType,
      },
    });
  }

  // Move the incident forward, but never regress a monitoring/resolved one.
  if (
    incident.status === "open" ||
    incident.status === "investigating" ||
    incident.status === "identified"
  ) {
    const nextStatus = proposedCount > 0 ? "identified" : "investigating";
    if (nextStatus !== incident.status) {
      await supabase
        .from("incidents")
        .update({ status: nextStatus })
        .eq("id", incidentId);
    }
  }

  return { ok: true, analysisId, provider, usedFallback, proposedCount };
}

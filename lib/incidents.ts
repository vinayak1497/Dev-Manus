/**
 * Operational domain model — services & incidents (Screen_Navigation.md §7-§12,
 * schema in supabase/migrations/20261001000000_incident_domain.sql).
 *
 * Data-integrity contract (RULE.md §9): a service's status is `null` until a
 * real source reports it and renders as "Unknown" — never assumed healthy.
 * Counts here are of real rows the user/demo created, so they are honest data
 * (distinct from telemetry, which stays null until a monitor is connected).
 */

// Relative (not "@/lib/projects") so the pure detection/AI/remediation cores
// that import this module compile in the dependency-free `node --test` build,
// which does not resolve the "@/" path alias.
import type { ProjectHealth } from "./projects";

/** A service's health reuses the project health vocabulary (same DB CHECK). */
export type ServiceStatus = ProjectHealth;

export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export type IncidentStatus =
  | "open"
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved";

/** Every lifecycle state except `resolved` counts as an active incident. */
export const ACTIVE_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  "open",
  "investigating",
  "identified",
  "monitoring",
];

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Non-colour marker, required alongside colour (RULE.md §6.4). */
export const INCIDENT_SEVERITY_SYMBOL: Record<IncidentSeverity, string> = {
  critical: "✕",
  high: "▲",
  medium: "◆",
  low: "•",
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const SERVICE_STATUS_VALUES: readonly ServiceStatus[] = [
  "healthy",
  "warning",
  "critical",
  "unknown",
  "maintenance",
  "recovering",
];

const SEVERITY_VALUES: readonly IncidentSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
];

const STATUS_VALUES: readonly IncidentStatus[] = [
  "open",
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

/** A monitored service, narrowed from an untrusted DB row. */
export type Service = {
  id: string;
  name: string;
  kind: string | null;
  /** Null until a real source reports it — renders as "Unknown". */
  status: ServiceStatus | null;
  description: string | null;
  isDemo: boolean;
};

/** An incident, narrowed from an untrusted DB row. */
export type Incident = {
  id: string;
  serviceId: string | null;
  title: string;
  summary: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt: string;
  resolvedAt: string | null;
  isDemo: boolean;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

export function isActiveIncident(status: IncidentStatus): boolean {
  return status !== "resolved";
}

/** Narrow an untrusted services row; returns null if it has no usable id. */
export function toService(row: unknown): Service | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    name: asText(r.name) ?? "Untitled service",
    kind: asText(r.kind),
    status: oneOf(r.status, SERVICE_STATUS_VALUES),
    description: asText(r.description),
    isDemo: r.is_demo === true,
  };
}

/** Narrow an untrusted incidents row; returns null if it has no usable id. */
export function toIncident(row: unknown): Incident | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    serviceId: typeof r.service_id === "string" ? r.service_id : null,
    title: asText(r.title) ?? "Untitled incident",
    summary: asText(r.summary),
    severity: oneOf(r.severity, SEVERITY_VALUES) ?? "medium",
    status: oneOf(r.status, STATUS_VALUES) ?? "open",
    detectedAt: asText(r.detected_at) ?? new Date(0).toISOString(),
    resolvedAt: asText(r.resolved_at),
    isDemo: r.is_demo === true,
  };
}

/** Count real service rows by status; null status is grouped as "unknown". */
export function countServicesByStatus(
  services: Service[],
): Record<ServiceStatus, number> {
  const counts: Record<ServiceStatus, number> = {
    healthy: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
    maintenance: 0,
    recovering: 0,
  };
  for (const service of services) counts[service.status ?? "unknown"] += 1;
  return counts;
}

/** PostgREST/Postgres codes that mean "the table isn't there yet". */
export const MISSING_SCHEMA_CODES = ["PGRST205", "PGRST202", "42P01"];

export function isMissingSchema(code: string | undefined): boolean {
  return code !== undefined && MISSING_SCHEMA_CODES.includes(code);
}

// ===========================================================================
// Incident lifecycle (§107 steps 5-18)
//
// The requested lifecycle — Detected, Investigating, Action Required,
// Remediating, Verifying, Resolved — is a DISPLAY view over the existing
// `IncidentStatus` CHECK, not a second stored state machine. We derive the
// display phase from the stored status plus the remediation/verification
// context, so there is exactly one source of truth in the DB.
// ===========================================================================

export type IncidentLifecyclePhase =
  | "detected"
  | "investigating"
  | "action_required"
  | "remediating"
  | "verifying"
  | "resolved";

export const LIFECYCLE_PHASE_LABEL: Record<IncidentLifecyclePhase, string> = {
  detected: "Detected",
  investigating: "Investigating",
  action_required: "Action Required",
  remediating: "Remediating",
  verifying: "Verifying",
  resolved: "Resolved",
};

/** Ordinal for progress rendering; resolved is terminal. */
export const LIFECYCLE_PHASE_ORDER: readonly IncidentLifecyclePhase[] = [
  "detected",
  "investigating",
  "action_required",
  "remediating",
  "verifying",
  "resolved",
];

/**
 * Map the stored status (+ remediation/verification context) to the display
 * phase. Pure and total, so it is unit-tested directly.
 */
export function deriveLifecyclePhase(
  status: IncidentStatus,
  ctx: {
    remediationApplied?: boolean;
    verificationRunning?: boolean;
  } = {},
): IncidentLifecyclePhase {
  if (status === "resolved") return "resolved";
  if (status === "monitoring") {
    if (ctx.verificationRunning) return "verifying";
    if (ctx.remediationApplied) return "remediating";
    return "verifying";
  }
  if (status === "identified") return "action_required";
  if (status === "investigating") return "investigating";
  return "detected"; // open
}

// ===========================================================================
// Child records: events, evidence, AI analysis, remediation, verification,
// health checks. Each has a strict union + a narrower from an untrusted row.
// ===========================================================================

export type EventKind =
  | "detected"
  | "evidence"
  | "ai_analysis"
  | "remediation_proposed"
  | "remediation_approved"
  | "remediation_rejected"
  | "remediation_applied"
  | "verification"
  | "resolved"
  | "note";

export type EventActor = "system" | "ai" | "user";

export type EvidenceSource =
  | "metric"
  | "log"
  | "trace"
  | "deployment"
  | "event"
  | "config";

export type AiConfidence = "low" | "medium" | "high";
export type RemediationRisk = "low" | "medium" | "high";
export type RemediationProposedBy = "ai" | "user" | "system";
export type RemediationStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "applied"
  | "verified"
  | "failed";
export type VerificationStatus = "running" | "passed" | "failed" | "cancelled";
export type HealthCheckSource = "probe" | "synthetic" | "external" | "simulation";

/** Evidence grouping shown in the incident detail (§6). */
export const EVIDENCE_SOURCE_LABEL: Record<EvidenceSource, string> = {
  metric: "Metrics",
  log: "Logs",
  trace: "Traces",
  deployment: "Deployments",
  event: "Events",
  config: "Configuration",
};

export const CONFIDENCE_LABEL: Record<AiConfidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const RISK_LABEL: Record<RemediationRisk, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export const REMEDIATION_STATUS_LABEL: Record<RemediationStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Executed",
  verified: "Verified",
  failed: "Failed",
};

const EVENT_KIND_VALUES: readonly EventKind[] = [
  "detected",
  "evidence",
  "ai_analysis",
  "remediation_proposed",
  "remediation_approved",
  "remediation_rejected",
  "remediation_applied",
  "verification",
  "resolved",
  "note",
];
const EVENT_ACTOR_VALUES: readonly EventActor[] = ["system", "ai", "user"];
const EVIDENCE_SOURCE_VALUES: readonly EvidenceSource[] = [
  "metric",
  "log",
  "trace",
  "deployment",
  "event",
  "config",
];
const CONFIDENCE_VALUES: readonly AiConfidence[] = ["low", "medium", "high"];
const RISK_VALUES: readonly RemediationRisk[] = ["low", "medium", "high"];
const REMEDIATION_STATUS_VALUES: readonly RemediationStatus[] = [
  "proposed",
  "approved",
  "rejected",
  "applied",
  "verified",
  "failed",
];
const VERIFICATION_STATUS_VALUES: readonly VerificationStatus[] = [
  "running",
  "passed",
  "failed",
  "cancelled",
];
const HEALTH_CHECK_SOURCE_VALUES: readonly HealthCheckSource[] = [
  "probe",
  "synthetic",
  "external",
  "simulation",
];

export type IncidentEvent = {
  id: string;
  at: string;
  kind: EventKind;
  message: string;
  actor: EventActor;
  metadata: Record<string, unknown> | null;
  isDemo: boolean;
};

export type IncidentEvidence = {
  id: string;
  source: EvidenceSource;
  label: string;
  detail: string | null;
  observedAt: string | null;
  metadata: Record<string, unknown> | null;
  isDemo: boolean;
  createdAt: string;
};

export type AiAnalysisRecord = {
  id: string;
  provider: string | null;
  model: string | null;
  observation: string;
  interpretation: string;
  confidence: AiConfidence;
  confidenceRationale: string | null;
  suggestedAction: string | null;
  evidenceRefs: unknown;
  disclaimer: string;
  isDemo: boolean;
  createdAt: string;
};

export type RemediationAction = {
  id: string;
  aiAnalysisId: string | null;
  title: string;
  description: string | null;
  proposedBy: RemediationProposedBy;
  command: string | null;
  risk: RemediationRisk;
  status: RemediationStatus;
  requiresApproval: boolean;
  approvedAt: string | null;
  appliedAt: string | null;
  verifiedAt: string | null;
  result: string | null;
  isDemo: boolean;
  createdAt: string;
};

export type VerificationRun = {
  id: string;
  remediationActionId: string | null;
  status: VerificationStatus;
  checksRequired: number;
  checksPassed: number;
  detail: string | null;
  isDemo: boolean;
  startedAt: string;
  completedAt: string | null;
};

export type ServiceHealthCheck = {
  id: string;
  serviceId: string;
  status: ServiceStatus;
  source: HealthCheckSource;
  latencyMs: number | null;
  errorRate: number | null;
  detail: string | null;
  isDemo: boolean;
  checkedAt: string;
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function toIncidentEvent(row: unknown): IncidentEvent | null {
  const r = asRecord(row);
  if (!r || typeof r.id !== "string") return null;
  return {
    id: r.id,
    at: asText(r.at) ?? new Date(0).toISOString(),
    kind: oneOf(r.kind, EVENT_KIND_VALUES) ?? "note",
    message: asText(r.message) ?? "",
    actor: oneOf(r.actor, EVENT_ACTOR_VALUES) ?? "system",
    metadata: asRecord(r.metadata),
    isDemo: r.is_demo === true,
  };
}

export function toIncidentEvidence(row: unknown): IncidentEvidence | null {
  const r = asRecord(row);
  if (!r || typeof r.id !== "string") return null;
  return {
    id: r.id,
    source: oneOf(r.source, EVIDENCE_SOURCE_VALUES) ?? "event",
    label: asText(r.label) ?? "Evidence",
    detail: asText(r.detail),
    observedAt: asText(r.observed_at),
    metadata: asRecord(r.metadata),
    isDemo: r.is_demo === true,
    createdAt: asText(r.created_at) ?? new Date(0).toISOString(),
  };
}

export function toAiAnalysis(row: unknown): AiAnalysisRecord | null {
  const r = asRecord(row);
  if (!r || typeof r.id !== "string") return null;
  return {
    id: r.id,
    provider: asText(r.provider),
    model: asText(r.model),
    observation: asText(r.observation) ?? "",
    interpretation: asText(r.interpretation) ?? "",
    confidence: oneOf(r.confidence, CONFIDENCE_VALUES) ?? "low",
    confidenceRationale: asText(r.confidence_rationale),
    suggestedAction: asText(r.suggested_action),
    evidenceRefs: r.evidence_refs ?? null,
    disclaimer:
      asText(r.disclaimer) ??
      "AI-generated interpretation — not verified fact. Review the evidence before acting.",
    isDemo: r.is_demo === true,
    createdAt: asText(r.created_at) ?? new Date(0).toISOString(),
  };
}

export function toRemediationAction(row: unknown): RemediationAction | null {
  const r = asRecord(row);
  if (!r || typeof r.id !== "string") return null;
  return {
    id: r.id,
    aiAnalysisId: typeof r.ai_analysis_id === "string" ? r.ai_analysis_id : null,
    title: asText(r.title) ?? "Remediation action",
    description: asText(r.description),
    proposedBy:
      oneOf(r.proposed_by, ["ai", "user", "system"] as const) ?? "ai",
    command: asText(r.command),
    risk: oneOf(r.risk, RISK_VALUES) ?? "medium",
    status: oneOf(r.status, REMEDIATION_STATUS_VALUES) ?? "proposed",
    requiresApproval: r.requires_approval !== false,
    approvedAt: asText(r.approved_at),
    appliedAt: asText(r.applied_at),
    verifiedAt: asText(r.verified_at),
    result: asText(r.result),
    isDemo: r.is_demo === true,
    createdAt: asText(r.created_at) ?? new Date(0).toISOString(),
  };
}

export function toVerificationRun(row: unknown): VerificationRun | null {
  const r = asRecord(row);
  if (!r || typeof r.id !== "string") return null;
  return {
    id: r.id,
    remediationActionId:
      typeof r.remediation_action_id === "string"
        ? r.remediation_action_id
        : null,
    status: oneOf(r.status, VERIFICATION_STATUS_VALUES) ?? "running",
    checksRequired: asFiniteNumber(r.checks_required) ?? 3,
    checksPassed: asFiniteNumber(r.checks_passed) ?? 0,
    detail: asText(r.detail),
    isDemo: r.is_demo === true,
    startedAt: asText(r.started_at) ?? new Date(0).toISOString(),
    completedAt: asText(r.completed_at),
  };
}

export function toServiceHealthCheck(row: unknown): ServiceHealthCheck | null {
  const r = asRecord(row);
  if (!r || typeof r.id !== "string" || typeof r.service_id !== "string") {
    return null;
  }
  return {
    id: r.id,
    serviceId: r.service_id,
    status: oneOf(r.status, SERVICE_STATUS_VALUES) ?? "unknown",
    source: oneOf(r.source, HEALTH_CHECK_SOURCE_VALUES) ?? "probe",
    latencyMs: asFiniteNumber(r.latency_ms),
    errorRate: asFiniteNumber(r.error_rate),
    detail: asText(r.detail),
    isDemo: r.is_demo === true,
    checkedAt: asText(r.checked_at) ?? new Date(0).toISOString(),
  };
}





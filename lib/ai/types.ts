/**
 * AI provider abstraction (acceptance §107 steps 11-13).
 *
 * A provider receives ONLY the structured, real evidence gathered for an
 * incident and returns a strictly-shaped interpretation. It is advisory and
 * read-only: nothing here can change an incident or apply a fix. The hard rule
 * (§13) is that a provider must not invent evidence — it reasons over the
 * supplied facts or says the evidence is insufficient.
 */

import type { RemediationActionType } from "../remediation/actions";

/** The real evidence handed to a provider. No free-form model context. */
export type IncidentAnalysisInput = {
  incident: {
    title: string;
    severity: string;
    status: string;
    detectedAt: string;
    serviceName: string | null;
    environment: string | null;
  };
  evidence: Array<{
    source: string;
    label: string;
    detail: string | null;
    observedAt: string | null;
  }>;
  timeline: Array<{
    at: string;
    kind: string;
    message: string;
    actor: string;
  }>;
  healthChecks: Array<{
    status: string;
    latencyMs: number | null;
    errorRate: number | null;
    checkedAt: string;
  }>;
  deployment: {
    version: string | null;
    commit: string | null;
    status: string | null;
    deployedAt: string | null;
  } | null;
  serviceState: { name: string; status: string | null } | null;
};

/** A single citation back to one supplied piece of evidence. */
export type AnalysisEvidenceRef = {
  source: string;
  timestamp: string | null;
  statement: string;
};

export type SuggestedAction = {
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
  /** When set, maps this suggestion to a typed allowlisted remediation. */
  actionType?: RemediationActionType;
};

/** The strict, validated shape every provider must return. */
export type IncidentAnalysis = {
  observation: string;
  evidence: AnalysisEvidenceRef[];
  interpretation: string;
  confidence: "low" | "medium" | "high";
  suggestedActions: SuggestedAction[];
  /** True when the supplied evidence was too thin to interpret (§13). */
  insufficientEvidence: boolean;
};

export interface AIProvider {
  /** Stable identifier for logging (never logs keys/prompts). */
  readonly name: string;
  analyzeIncident(input: IncidentAnalysisInput): Promise<IncidentAnalysis>;
}

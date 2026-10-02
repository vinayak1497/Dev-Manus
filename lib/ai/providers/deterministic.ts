/**
 * Deterministic, rule-based AI provider (acceptance §107 steps 11-13, §25).
 *
 * This provider reasons ONLY over the supplied structured evidence. It never
 * calls a network and never invents a log line, metric, timestamp, deployment
 * or event — every citation it returns is copied from the input. That makes it:
 *   - the honest no-API-key fallback (always available, clearly labelled), and
 *   - the deterministic provider the E2E/acceptance test uses so the workflow
 *     is verifiable without live model credentials.
 *
 * Pure (no IO), so it is unit tested directly, including the "insufficient
 * evidence" branch that proves it declines rather than fabricates.
 */

import type {
  AnalysisEvidenceRef,
  AIProvider,
  IncidentAnalysis,
  IncidentAnalysisInput,
  SuggestedAction,
} from "../types";
import { REMEDIATION_ALLOWLIST } from "../../remediation/actions";

function toAction(
  type: keyof typeof REMEDIATION_ALLOWLIST,
): SuggestedAction {
  const spec = REMEDIATION_ALLOWLIST[type];
  return {
    title: spec.title,
    description: spec.description,
    risk: spec.risk,
    actionType: spec.type,
  };
}

/** Deployment is "recent" if it landed at or before detection (chronologically). */
function deploymentPrecededIncident(input: IncidentAnalysisInput): boolean {
  const dep = input.deployment;
  if (!dep || !dep.deployedAt) return false;
  const d = Date.parse(dep.deployedAt);
  const t = Date.parse(input.incident.detectedAt);
  if (Number.isNaN(d) || Number.isNaN(t)) return false;
  return d <= t;
}

export class DeterministicProvider implements AIProvider {
  readonly name = "deterministic-rules";

  async analyzeIncident(
    input: IncidentAnalysisInput,
  ): Promise<IncidentAnalysis> {
    const citations: AnalysisEvidenceRef[] = [];

    // Cite every supplied evidence row verbatim — no invention.
    for (const e of input.evidence) {
      citations.push({
        source: e.source,
        timestamp: e.observedAt,
        statement: e.detail ? `${e.label}: ${e.detail}` : e.label,
      });
    }

    const failingChecks = input.healthChecks.filter(
      (c) => c.status === "critical" || c.status === "warning",
    );
    for (const c of failingChecks) {
      const parts = [`Health check reported ${c.status}`];
      if (c.latencyMs !== null) parts.push(`latency ${c.latencyMs}ms`);
      if (c.errorRate !== null) {
        parts.push(`error rate ${(c.errorRate * 100).toFixed(1)}%`);
      }
      citations.push({
        source: "health-check",
        timestamp: c.checkedAt,
        statement: parts.join(", "),
      });
    }

    const depCorrelated = deploymentPrecededIncident(input);
    if (input.deployment) {
      const dep = input.deployment;
      const label = dep.version ?? dep.commit ?? "unknown revision";
      citations.push({
        source: "deployment",
        timestamp: dep.deployedAt,
        statement: `Deployment ${label}${dep.status ? ` (${dep.status})` : ""}${
          depCorrelated ? " occurred shortly before the incident" : ""
        }`,
      });
    }

    const serviceName = input.incident.serviceName ?? "the affected service";

    // No evidence at all -> decline honestly (§13), do not manufacture a cause.
    if (citations.length === 0) {
      return {
        observation: `${serviceName} has an open incident, but no evidence rows, health checks, or deployment records were supplied.`,
        evidence: [],
        interpretation:
          "Insufficient evidence to determine a likely cause. Gather more signals (health checks, metrics, logs) before drawing a conclusion or acting.",
        confidence: "low",
        suggestedActions: [toAction("RETRY_HEALTH_CHECK")],
        insufficientEvidence: true,
      };
    }

    // Build a hedged interpretation strictly from what was observed.
    const clauses: string[] = [];
    if (failingChecks.length > 0) {
      clauses.push(
        `${failingChecks.length} health check(s) observed ${serviceName} in a ${failingChecks[0].status} state`,
      );
    }
    if (depCorrelated) {
      clauses.push(
        "a deployment landed shortly before detection, so it is a candidate to investigate — this correlation is not proof of causation",
      );
    }
    if (input.evidence.some((e) => e.source === "metric")) {
      clauses.push("recorded metrics are consistent with a degradation");
    }
    if (input.evidence.some((e) => e.source === "log")) {
      clauses.push("log evidence was captured at detection time");
    }
    const interpretation =
      clauses.length > 0
        ? `Based only on the supplied evidence: ${clauses.join("; ")}.`
        : "The supplied evidence records a fault but does not point to a single cause; treat the interpretation as tentative.";

    // Confidence scales with how many independent signals corroborate.
    const signals = [
      failingChecks.length > 0,
      depCorrelated,
      input.evidence.some((e) => e.source === "metric"),
      input.evidence.some((e) => e.source === "log"),
    ].filter(Boolean).length;
    const confidence: IncidentAnalysis["confidence"] =
      signals >= 3 ? "high" : signals >= 2 ? "medium" : "low";

    // Suggest allowlisted actions, most relevant first.
    const actions: SuggestedAction[] = [];
    if (depCorrelated) actions.push(toAction("ROLLBACK_DEMO_DEPLOYMENT"));
    actions.push(toAction("RESTART_DEMO_SERVICE"));
    actions.push(toAction("RETRY_HEALTH_CHECK"));

    return {
      observation: `${serviceName} is in a ${input.serviceState?.status ?? input.incident.status} state; ${citations.length} piece(s) of evidence were recorded around ${input.incident.detectedAt}.`,
      evidence: citations,
      interpretation,
      confidence,
      suggestedActions: actions,
      insufficientEvidence: false,
    };
  }
}

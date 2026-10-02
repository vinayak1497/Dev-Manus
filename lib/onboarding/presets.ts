/**
 * Detection-driven defaults. Everything here is a *suggestion* applied only
 * when analysis actually found something — otherwise fields stay empty and
 * the UI shows “Not detected / manual”.
 *
 * Two rules govern this file (RULE.md §9, Design.md §43):
 * 1. Never invent a value. No guessed commands, no assumed runtime versions,
 *    no pre-filled health endpoint. If there is no evidence, leave the field
 *    empty and let the UI say “Not detected”.
 * 2. Never upgrade weak evidence to a strong claim. A client library proves
 *    the code *can* talk to a service; configuration that *names* the service
 *    proves it is actually used.
 */
import type { RepoAnalysis, WizardState } from "./types";
import { suggestedFunctionalEndpoint } from "./health-evidence";

function ready(a: RepoAnalysis | null): a is RepoAnalysis {
  return !!a && a.status === "ready";
}

export function suggestRuntimeFromAnalysis(
  a: RepoAnalysis | null,
  strategy: WizardState["deployment"]["strategy"] | null = null,
): Partial<WizardState["runtime"]> {
  if (!ready(a)) return {};
  const out: Partial<WizardState["runtime"]> = {};

  // Development, build, and production start are three different facts. The
  // analyzer keeps them separate, so a development server is never presented
  // as the production start command. Production commands are deployment
  // specific: Helm defaults and Kubernetes manifests can legitimately differ.
  const { development, build } = a.runtimeCommands;
  if (development.command) {
    out.devCommand = development.command;
    out.devCommandProvenance = "detected";
  }
  if (build.command) {
    out.buildCommand = build.command;
    out.buildProvenance = "detected";
  }
  const production = a.productionCommands.find((candidate) => candidate.strategy === strategy && candidate.command) ??
    a.productionCommands.find((candidate) => candidate.command);
  if (production?.command) {
    out.startCommand = production.command;
    out.startProvenance = "detected";
  }

  // Runtime is whatever the analysis actually detected as the language. No
  // version is asserted unless a file states one.
  const lang = a.language.value;
  if (lang) {
    out.runtime = lang;
    out.runtimeProvenance = "detected";
  } else if (a.framework.value) {
    // A framework implies a runtime family, but we did not read a language
    // marker, so this stays “Not detected”.
    out.runtimeProvenance = "not_detected";
  }

  // Only a semantically selected application port becomes the runtime port. A
  // common port such as 3000 must never override stronger deployment evidence,
  // and an ambiguous result must ask the user instead of filling a guess.
  if (a.applicationPort.selected.value !== null) {
    out.port = String(a.applicationPort.selected.value);
    out.portProvenance = "detected";
  }
  return out;
}

/**
 * Deployment options are derived in `deployment.ts`; this module intentionally
 * does not choose a strategy. Analysis offers evidence, the user selects the
 * actual deployment, and that selection is the single canonical value.
 */

/**
 * Dependency suggestions come straight from analyzer evidence tiers. Ports and
 * drivers alone remain weak evidence; only configuration that ties a service
 * to the application workload becomes `detected`.
 */
export function suggestDependenciesFromAnalysis(
  a: RepoAnalysis | null,
): Partial<WizardState["dependencies"]> {
  if (!ready(a)) return {};
  return {
    postgres: a.dependencyFindings.postgres.status,
    mysql: a.dependencyFindings.mysql.status,
    mongodb: a.dependencyFindings.mongodb.status,
    redis: a.dependencyFindings.redis.status,
  };
}

export function suggestHealthFromAnalysis(
  a: RepoAnalysis | null,
): Partial<WizardState["health"]> {
  if (!ready(a)) return {};
  const endpoint = suggestedFunctionalEndpoint(a.healthEndpoints.value ?? []);
  if (endpoint) {
    return { method: "http", endpoint, endpointProvenance: "detected", methodProvenance: "detected" };
  }
  // No functional endpoint was established. Suggest a port check only when an
  // unambiguous application port was selected; otherwise leave health manual.
  if (a.applicationPort.selected.value !== null) return { method: "port", methodProvenance: "detected" };
  return {};
}

export const HEALTH_DEFAULTS = {
  intervalSec: "30",
  timeoutSec: "5",
  failureThreshold: "3",
  expectedStatus: "200",
} as const;
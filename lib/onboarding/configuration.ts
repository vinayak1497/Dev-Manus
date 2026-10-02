/**
 * Canonical onboarding configuration.
 *
 * Data flow:
 *
 *   repository analyzer → evidence model → suggestions →
 *   user confirmation/editing → canonical WizardState → validation →
 *   Supabase persistence → read-back → dashboard/monitoring.
 *
 * Review, persistence, and validation must all consume the builders below.
 * No screen may reconstruct deployment, runtime, health, or dependency
 * meaning directly from analyzer booleans.
 */
import type {
  HealthState,
  OnboardingSubmitPayload,
  RepoAnalysis,
  WizardState,
} from "./types";
import { deploymentOptionsFromAnalysis, deploymentStrategyLabel } from "./deployment";
import {
  buildHealthCheckUrl,
  normalizeHealthPath,
  normalizeHealthTarget,
  splitHealthEndpoint,
} from "./health";
import {
  suggestDependenciesFromAnalysis,
  suggestHealthFromAnalysis,
  suggestRuntimeFromAnalysis,
} from "./presets";

export type ProductionStartState = "command" | "deployment_managed" | "not_set";

export type ResolvedHealthCheck = {
  method: HealthState["method"];
  targetType: HealthState["targetType"];
  targetUrl: string | null;
  endpointPath: string | null;
  expectedStatus: string;
  intervalSec: string;
  timeoutSec: string;
  failureThreshold: string;
  checkUrl: string | null;
  methodProvenance: HealthState["methodProvenance"];
  targetProvenance: HealthState["targetProvenance"];
  endpointProvenance: HealthState["endpointProvenance"];
};

export type CanonicalConfiguration = {
  deployment: {
    strategy: WizardState["deployment"]["strategy"];
    label: string;
    notes: string;
    useDetected: boolean;
  };
  runtime: WizardState["runtime"] & { startState: ProductionStartState };
  dependencies: WizardState["dependencies"];
  health: ResolvedHealthCheck;
  analysis: RepoAnalysis | null;
};

function normalizeHealthState(health: HealthState): HealthState {
  const normalized: HealthState = { ...health };
  if (!normalized.targetUrl.trim()) {
    const split = splitHealthEndpoint(normalized.endpoint);
    if (split) {
      normalized.targetUrl = split.targetUrl;
      normalized.endpoint = split.path;
      if (normalized.targetProvenance === "not_detected") normalized.targetProvenance = "configured";
      if (normalized.endpointProvenance === "not_detected") normalized.endpointProvenance = "configured";
    }
  }
  return normalized;
}

export function resolveHealthCheck(health: HealthState): ResolvedHealthCheck {
  const normalized = normalizeHealthState(health);
  const target = normalizeHealthTarget(normalized.targetUrl);
  const endpoint = normalizeHealthPath(normalized.endpoint);
  const check = buildHealthCheckUrl(normalized.targetUrl, normalized.endpoint);
  return {
    method: normalized.method,
    targetType: normalized.targetType,
    targetUrl: target.value,
    endpointPath: endpoint.value,
    expectedStatus: normalized.expectedStatus.trim(),
    intervalSec: normalized.intervalSec.trim(),
    timeoutSec: normalized.timeoutSec.trim(),
    failureThreshold: normalized.failureThreshold.trim(),
    checkUrl: check.url,
    methodProvenance: normalized.methodProvenance,
    targetProvenance: normalized.targetProvenance,
    endpointProvenance: normalized.endpointProvenance,
  };
}

export function resolveProductionStart(
  runtime: WizardState["runtime"],
  strategy: WizardState["deployment"]["strategy"],
): ProductionStartState {
  if (runtime.startCommand.trim()) return "command";
  if (strategy === "kubernetes" || strategy === "helm") return "deployment_managed";
  return "not_set";
}

export function buildCanonicalConfiguration(state: WizardState): CanonicalConfiguration {
  const health = resolveHealthCheck(state.health);
  return {
    deployment: {
      strategy: state.deployment.strategy,
      label: state.deployment.strategy ? deploymentStrategyLabel(state.deployment.strategy) : "Not set",
      notes: state.deployment.notes,
      useDetected: state.deployment.useDetected,
    },
    runtime: {
      ...state.runtime,
      startState: resolveProductionStart(state.runtime, state.deployment.strategy),
    },
    dependencies: state.dependencies,
    health,
    analysis: state.analysis,
  };
}

export function canonicalSubmitSections(state: WizardState): Pick<OnboardingSubmitPayload, "deployment" | "runtime" | "dependencies" | "health"> {
  const canonical = buildCanonicalConfiguration(state);
  return {
    deployment: {
      strategy: canonical.deployment.strategy,
      useDetected: canonical.deployment.useDetected,
      notes: canonical.deployment.notes,
    },
    runtime: {
      buildCommand: canonical.runtime.buildCommand,
      buildProvenance: canonical.runtime.buildProvenance,
      startCommand: canonical.runtime.startCommand,
      startProvenance: canonical.runtime.startProvenance,
      devCommand: canonical.runtime.devCommand,
      devCommandProvenance: canonical.runtime.devCommandProvenance,
      runtime: canonical.runtime.runtime,
      runtimeProvenance: canonical.runtime.runtimeProvenance,
      port: canonical.runtime.port,
      portProvenance: canonical.runtime.portProvenance,
      protocol: canonical.runtime.protocol,
      rootDirectory: canonical.runtime.rootDirectory,
    },
    dependencies: canonical.dependencies,
    health: normalizeHealthState(state.health),
  };
}

function applyRuntimeField(
  currentValue: string,
  currentProvenance: WizardState["runtime"]["buildProvenance"],
  suggestedValue: string | undefined,
  suggestedProvenance: WizardState["runtime"]["buildProvenance"],
): { value: string; provenance: WizardState["runtime"]["buildProvenance"] } {
  if (currentProvenance === "configured") return { value: currentValue, provenance: currentProvenance };
  if (suggestedValue !== undefined) return { value: suggestedValue, provenance: suggestedProvenance };
  return { value: "", provenance: "not_detected" };
}

/**
 * Apply analyzer suggestions without clobbering explicit user choices.
 *
 * Detected values are replaced wholesale on every analysis, so a repository
 * change from Node.js to Go cannot leave a stale `npm start` behind. Values
 * the user configured are preserved.
 */
export function applyAnalysisSuggestions(previous: WizardState, analysis: RepoAnalysis): WizardState {
  const strategy = previous.deployment.strategy || null;
  const runtimeSug = suggestRuntimeFromAnalysis(analysis, strategy);
  const depSug = suggestDependenciesFromAnalysis(analysis);
  const healthSug = suggestHealthFromAnalysis(analysis);
  const detectedStrategies = new Set(
    deploymentOptionsFromAnalysis(analysis).filter((option) => option.detected).map((option) => option.strategy),
  );

  const build = applyRuntimeField(previous.runtime.buildCommand, previous.runtime.buildProvenance, runtimeSug.buildCommand, "detected");
  const start = applyRuntimeField(previous.runtime.startCommand, previous.runtime.startProvenance, runtimeSug.startCommand, "detected");
  const dev = applyRuntimeField(previous.runtime.devCommand, previous.runtime.devCommandProvenance, runtimeSug.devCommand, "detected");
  const runtimeName = applyRuntimeField(previous.runtime.runtime, previous.runtime.runtimeProvenance, runtimeSug.runtime, "detected");
  const port = applyRuntimeField(previous.runtime.port, previous.runtime.portProvenance, runtimeSug.port, "detected");

  const dependencies = { ...previous.dependencies };
  for (const key of ["postgres", "mysql", "mongodb", "redis"] as const) {
    if (previous.dependencies[key] !== "configured" && depSug[key]) {
      dependencies[key] = depSug[key] as typeof dependencies[typeof key];
    }
  }

  const health = normalizeHealthState(previous.health);
  const methodConfigured = health.methodProvenance === "configured";
  const endpointConfigured = health.endpointProvenance === "configured";
  if (!methodConfigured && healthSug.method) {
    health.method = healthSug.method;
    health.methodProvenance = "detected";
  } else if (!methodConfigured && !healthSug.method) {
    health.methodProvenance = health.endpoint.trim() || health.targetUrl.trim() ? health.methodProvenance : "not_detected";
  }
  if (!endpointConfigured) {
    if (healthSug.endpoint !== undefined) {
      health.endpoint = healthSug.endpoint;
      health.endpointProvenance = "detected";
    } else if (!health.endpoint.trim()) {
      health.endpointProvenance = "not_detected";
    }
  }

  return {
    ...previous,
    analysis,
    analysisStatus: analysis.status === "ready" ? "ready" : "unavailable",
    analysisError: null,
    runtime: {
      ...previous.runtime,
      buildCommand: build.value,
      buildProvenance: build.provenance,
      startCommand: start.value,
      startProvenance: start.provenance,
      devCommand: dev.value,
      devCommandProvenance: dev.provenance,
      runtime: runtimeName.value,
      runtimeProvenance: runtimeName.provenance,
      port: port.value,
      portProvenance: port.provenance,
    },
    deployment: {
      ...previous.deployment,
      // Analysis never selects a strategy. It only refreshes whether the
      // existing explicit selection is still among the detected options.
      useDetected: previous.deployment.strategy ? detectedStrategies.has(previous.deployment.strategy) : previous.deployment.useDetected,
    },
    dependencies,
    health,
  };
}

/**
 * Change the deployment strategy, then refresh only detected runtime values
 * from strategy-specific evidence. A configured command or port is never
 * replaced by a strategy change.
 */
export function applyDeploymentStrategy(
  previous: WizardState,
  strategy: WizardState["deployment"]["strategy"],
  analysis: RepoAnalysis | null,
): WizardState {
  const detectedStrategies = new Set(
    deploymentOptionsFromAnalysis(analysis).filter((option) => option.detected).map((option) => option.strategy),
  );
  const runtimeSug = analysis?.status === "ready" ? suggestRuntimeFromAnalysis(analysis, strategy) : {};
  const build = applyRuntimeField(previous.runtime.buildCommand, previous.runtime.buildProvenance, runtimeSug.buildCommand, "detected");
  const start = applyRuntimeField(previous.runtime.startCommand, previous.runtime.startProvenance, runtimeSug.startCommand, "detected");
  const port = applyRuntimeField(previous.runtime.port, previous.runtime.portProvenance, runtimeSug.port, "detected");
  return {
    ...previous,
    deployment: {
      ...previous.deployment,
      strategy,
      useDetected: strategy ? detectedStrategies.has(strategy) : false,
    },
    runtime: {
      ...previous.runtime,
      buildCommand: build.value,
      buildProvenance: build.provenance,
      startCommand: start.value,
      startProvenance: start.provenance,
      port: port.value,
      portProvenance: port.provenance,
    },
  };
}

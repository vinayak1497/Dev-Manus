/**
 * Canonical deployment strategy.
 *
 * Repository analysis can only offer deployment options. The wizard owns one
 * `DeploymentState.strategy`, Review renders that same value, persistence
 * stores it, and the dashboard reads it back. No screen derives its own
 * strategy from analyzer booleans.
 */
import type { DeploymentState, DeploymentStrategy, RepoAnalysis } from "./types";
import { evidencePaths } from "./evidence";

export const DEPLOYMENT_STRATEGY_LABEL: Record<DeploymentStrategy, string> = {
  dockerfile: "Dockerfile",
  compose: "Docker Compose",
  kubernetes: "Kubernetes manifests",
  helm: "Helm chart",
  framework: "Framework default",
  manual: "Manual",
  none: "No deployment config yet",
};

export function deploymentStrategyLabel(strategy: string | null | undefined): string {
  if (!strategy) return "Not set";
  return DEPLOYMENT_STRATEGY_LABEL[strategy as DeploymentStrategy] ?? strategy;
}

export type DeploymentOption = {
  strategy: DeploymentStrategy;
  detected: boolean;
  evidence: string[];
  note: string;
};

const OPTION_NOTES: Record<DeploymentStrategy, string> = {
  dockerfile: "Build and run from the detected Dockerfile.",
  compose: "Run the composed services together.",
  kubernetes: "Apply the detected manifests.",
  helm: "Install the detected chart.",
  framework: "Use the framework's standard deployment.",
  manual: "Describe the deployment in your own words.",
  none: "Skip — connect it later from the dashboard.",
};

/** Every deployment option, with detected technologies marked from evidence. */
export function deploymentOptionsFromAnalysis(analysis: RepoAnalysis | null): DeploymentOption[] {
  const detected = new Set<DeploymentStrategy>();
  if (analysis?.status === "ready") {
    if (analysis.dockerfile.value) detected.add("dockerfile");
    if (analysis.compose.value) detected.add("compose");
    if (analysis.kubernetes.value) detected.add("kubernetes");
    if (analysis.helm.value) detected.add("helm");
    if (analysis.framework.value) detected.add("framework");
  }
  const strategies: DeploymentStrategy[] = [
    "dockerfile",
    "compose",
    "kubernetes",
    "helm",
    "framework",
    "manual",
    "none",
  ];
  return strategies.map((strategy) => ({
    strategy,
    detected: detected.has(strategy),
    evidence:
      strategy === "dockerfile"
        ? evidencePaths(analysis?.evidence.dockerfile)
        : strategy === "compose"
          ? evidencePaths(analysis?.evidence.compose)
          : strategy === "kubernetes"
            ? evidencePaths(analysis?.evidence.kubernetes)
            : strategy === "helm"
              ? evidencePaths(analysis?.evidence.helm)
              : strategy === "framework"
                ? evidencePaths(analysis?.evidence.framework)
                : [],
    note: OPTION_NOTES[strategy],
  }));
}

/**
 * Select the deployment strategy without letting a new analysis silently
 * replace an explicit user choice. Runtime suggestions are refreshed by the
 * caller; this helper only owns deployment state.
 */
export function selectDeploymentStrategy(
  previous: DeploymentState,
  strategy: DeploymentStrategy,
  detected: Set<DeploymentStrategy>,
): DeploymentState {
  return {
    ...previous,
    strategy,
    useDetected: detected.has(strategy),
  };
}

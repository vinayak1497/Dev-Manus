/**
 * Display labels for detection states.
 *
 * Kept dependency-free on purpose: dashboard and badge components import
 * these without pulling the repository-analysis engine (YAML/Helm/Kubernetes
 * parsers) into their bundles.
 */
import type { DependencyStatus } from "./types";

export function dependencyStatusLabel(status: DependencyStatus): string {
  if (status === "detected") return "Detected";
  if (status === "configured") return "Configured";
  if (status === "not_detected") return "Not detected";
  return "Not confirmed";
}

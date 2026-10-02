/**
 * Semantic health-endpoint evidence.
 *
 * Kubernetes probe kinds have operational meanings: liveness asks whether the
 * container should be restarted, readiness asks whether it should receive
 * traffic, and startup guards slow initialization. An application route is a
 * separate functional check. These findings preserve those roles instead of
 * collapsing every path into one generic "health endpoint".
 */
import type { HealthEndpointFinding, HealthEndpointRole } from "./types";
import { makeEvidence } from "./evidence";
import type { K8sObjects, K8sProbe } from "./kubernetes";
import { lineOf } from "./manifests";
import type { RouteFinding } from "./routes";

function probeRole(kind: K8sProbe["kind"]): HealthEndpointRole {
  if (kind === "readiness") return "readiness";
  if (kind === "startup") return "startup";
  return "liveness";
}

function resolveProbePort(
  objects: K8sObjects,
  workloadPath: string,
  containerName: string | null,
  port: number | string | null,
): number | null {
  if (typeof port === "number") return port;
  if (typeof port !== "string") return null;
  for (const workload of objects.workloads) {
    if (workload.path !== workloadPath) continue;
    for (const container of workload.containers) {
      if (containerName && container.name !== containerName) continue;
      for (const entry of container.ports) {
        if (entry.name === port && entry.port !== null) return entry.port;
      }
    }
  }
  return null;
}

export function extractHealthEndpointFindings(
  files: Record<string, string | null>,
  objects: K8sObjects,
  routes: RouteFinding[],
): HealthEndpointFinding[] {
  const out: HealthEndpointFinding[] = [];
  for (const workload of objects.workloads) {
    const raw = files[workload.path] ?? "";
    const template = workload.path.includes("/templates/");
    for (const container of workload.containers) {
      for (const probe of container.probes) {
        if (!probe.path) continue;
        const port = resolveProbePort(objects, workload.path, container.name, probe.port);
        const field =
          probe.mechanism === "exec"
            ? `containers.${probe.kind}Probe.exec.command`
            : `containers.${probe.kind}Probe.httpGet.path`;
        const line = typeof raw === "string" ? lineOf(raw, new RegExp(`${probe.kind}Probe`)) : undefined;
        out.push({
          path: probe.path,
          role: probeRole(probe.kind),
          evidence: makeEvidence({
            sourcePath: workload.path,
            field,
            ...(line === undefined ? {} : { line }),
            evidenceType: probe.mechanism === "exec" ? "exec_probe" : "http_probe",
            semanticRole: probeRole(probe.kind),
            confidence: template ? "medium" : "high",
            explanation:
              probe.mechanism === "exec"
                ? `Kubernetes ${probe.kind} probe checks ${probe.path}${port ? ` on port ${port}` : ""}.`
                : `Kubernetes ${probe.kind} probe requests ${probe.path}${port ? ` on port ${port}` : ""}.`,
          }),
        });
      }
    }
  }

  for (const route of routes) {
    if (route.kind === "administrative") continue;
    if (route.kind === "auxiliary" && route.path !== "/metrics") continue;
    out.push({
      path: route.path,
      role: route.path === "/metrics" ? "metrics" : "application",
      evidence: makeEvidence({
        sourcePath: route.sourcePath,
        ...(route.line === undefined ? {} : { line: route.line }),
        evidenceType: "route",
        semanticRole: route.path === "/metrics" ? "metrics" : "application",
        confidence: route.confidence,
        explanation: route.explanation,
      }),
    });
  }

  const order: HealthEndpointRole[] = ["application", "liveness", "readiness", "startup", "metrics"];
  const seen = new Set<string>();
  return out
    .filter((finding) => {
      const key = `${finding.role}\0${finding.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.path.localeCompare(b.path))
    .slice(0, 8);
}

export function probeNumericPorts(objects: K8sObjects): Set<number> {
  const ports = new Set<number>();
  for (const workload of objects.workloads) {
    for (const container of workload.containers) {
      for (const probe of container.probes) {
        if (typeof probe.port === "number") {
          ports.add(probe.port);
          continue;
        }
        if (typeof probe.port === "string") {
          for (const entry of container.ports) {
            if (entry.name === probe.port && entry.port !== null) ports.add(entry.port);
          }
        }
      }
    }
  }
  return ports;
}

export function suggestedFunctionalEndpoint(findings: HealthEndpointFinding[]): string | null {
  const application = findings.filter((finding) => finding.role === "application").map((finding) => finding.path);
  if (application.includes("/")) return "/";
  const concrete = application.filter((path) => !path.includes("*"));
  if (concrete.length > 0) {
    return [...concrete].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  }
  const probe = findings.find((finding) => finding.role === "liveness" || finding.role === "readiness" || finding.role === "startup");
  return probe?.path ?? null;
}

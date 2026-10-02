/**
 * Evidence-aware port model.
 *
 * A bare port number is not a configuration claim. These helpers classify
 * each discovered port by role and provenance, then rank only
 * application-facing candidates. Infrastructure, service, NodePort, metrics,
 * and gRPC observations remain visible, but they can never silently become
 * the application port.
 */
import type {
  ApplicationPortSelection,
  EvidenceConfidence,
  PortFinding,
  PortProtocol,
  PortRole,
} from "./types";
import { makeEvidence } from "./evidence";
import type { ComposeService } from "./containers";
import type { K8sObjects, K8sService, K8sWorkload, ServiceBinding } from "./kubernetes";

export type FrameworkPort = {
  port: number;
  protocol?: PortProtocol;
  sourcePath: string;
  field?: string;
  line?: number;
  explanation: string;
};

export type CommandPort = {
  port: number;
  role: PortRole;
  sourcePath: string;
  field?: string;
  line?: number;
  confidence: EvidenceConfidence;
  command: string;
  explanation: string;
};

export type ServicePortInput = {
  binding: ServiceBinding;
  service: K8sService;
  workload: K8sWorkload | null;
};

const CONFIDENCE_SCORE: Record<EvidenceConfidence, number> = {
  high: 300,
  medium: 200,
  low: 100,
};

const EVIDENCE_SCORE: Record<string, number> = {
  container_command_argument: 90,
  service_target: 80,
  named_container_port: 70,
  framework_configuration: 70,
  helm_value: 60,
  compose_mapping: 55,
  docker_expose: 50,
  probe: 40,
  service_port: 20,
  ingress_backend: 20,
  node_port: 10,
  framework_default: 5,
  unknown: 0,
};

function roleFromName(name: string | null, fallback: PortRole = "unknown"): PortRole {
  if (!name) return fallback;
  const text = name.toLowerCase();
  if (/(metric|prometheus|statsd)/.test(text)) return "metrics";
  if (/grpc/.test(text)) return "grpc";
  if (/(postgres|postgresql|mysql|mariadb|mongo|mssql|oracle|db-|database)/.test(text)) return "database";
  if (/(redis|memcached|cache)/.test(text)) return "cache";
  if (/(kafka|rabbit|nats|amqp|queue|stream)/.test(text)) return "message_queue";
  if (/(otel|collector|jaeger|tempo|loki|grafana|tracing|telemetry)/.test(text)) return "telemetry";
  if (/https|tls|secure/.test(text)) return "application_https";
  if (/http|https|app|web|api|server|frontend|backend|service|port/.test(text)) return "application_http";
  return fallback;
}

function infrastructureRole(serviceName: string | null, image: string | null): PortRole | null {
  const text = `${serviceName ?? ""} ${image ?? ""}`.toLowerCase();
  if (/(postgres|postgresql)/.test(text)) return "database";
  if (/(mysql|mariadb)/.test(text)) return "database";
  if (/mongo/.test(text)) return "database";
  if (/(redis|memcached)/.test(text)) return "cache";
  if (/(kafka|rabbit|nats|amqp)/.test(text)) return "message_queue";
  if (/(otel|collector|jaeger|tempo|loki|grafana|prometheus)/.test(text)) return "telemetry";
  return null;
}

function evidenceScore(finding: PortFinding): number {
  return (
    CONFIDENCE_SCORE[finding.evidence.confidence] +
    (EVIDENCE_SCORE[finding.evidence.evidenceType] ?? 0) +
    (finding.role === "application_http" || finding.role === "application_https" ? 10 : 0)
  );
}

/** Combine findings from different sources without collapsing distinct evidence. */
export function mergePortFindings(findings: PortFinding[]): PortFinding[] {
  return findings
    .filter((finding) => finding.port > 0)
    .sort((a, b) => a.port - b.port || a.role.localeCompare(b.role));
}

export function collectKubernetesPortFindings(objects: K8sObjects, bindings: ServiceBinding[]): PortFinding[] {
  const out: PortFinding[] = [];
  const bindingForWorkload = new Map<string, ServiceBinding[]>();
  for (const binding of bindings) {
    if (!binding.workload) continue;
    const key = `${binding.workload.path}\0${binding.workload.name ?? ""}`;
    bindingForWorkload.set(key, [...(bindingForWorkload.get(key) ?? []), binding]);
  }
  for (const workload of objects.workloads) {
    const key = `${workload.path}\0${workload.name ?? ""}`;
    const workloadBindings = bindingForWorkload.get(key) ?? [];
    const linked = workloadBindings.length > 0;
    const confidence: EvidenceConfidence = workloadBindings.some((binding) => binding.exactSelector)
      ? "high"
      : linked
        ? "medium"
        : "medium";
    for (const container of workload.containers) {
      for (const port of container.ports) {
        if (port.port === null) continue;
        const namedRole = roleFromName(port.name, "unknown");
        out.push({
          port: port.port,
          protocol: port.protocol,
          role: namedRole,
          evidence: makeEvidence({
            sourcePath: workload.path,
            field: "containers.ports.containerPort",
            line: port.line,
            evidenceType: "named_container_port",
            semanticRole: namedRole,
            confidence,
            explanation:
              namedRole === "unknown"
                ? `Container declares port ${port.port} without an application role in its name${linked ? " and a Service is bound to this workload" : ""}.`
                : `Container port ${port.port} is named ${port.name ?? "unnamed"}${linked ? " and a Service is bound to this workload" : ""}.`,
          }),
        });
      }
    }
  }
  for (const binding of bindings) {
    const { service, workload } = binding;
    const bindingConfidence: EvidenceConfidence = binding.exactSelector ? "high" : binding.workload ? "medium" : "low";
    const bindingNote = binding.exactSelector
      ? "the Service selector matches the workload's Pod labels"
      : binding.workload
        ? "the Service and workload share the same chart or directory scope"
        : "no workload with matching labels was found";
    for (const entry of service.ports) {
      if (entry.port !== null) {
        out.push({
          port: entry.port,
          protocol: entry.protocol,
          role: "service",
          evidence: makeEvidence({
            sourcePath: service.path,
            field: "Service.spec.ports.port",
            line: entry.line,
            evidenceType: "service_port",
            semanticRole: "service",
            confidence: "high",
            explanation: `Service ${service.name ?? "unnamed"} exposes port ${entry.port}; this is the Service port, not proof of the container port.`,
          }),
        });
      }
      const target = entry.targetPort ?? entry.port;
      if (entry.nodePort !== null) {
        out.push({
          port: entry.nodePort,
          protocol: entry.protocol,
          role: "node_port",
          evidence: makeEvidence({
            sourcePath: service.path,
            field: "Service.spec.ports.nodePort",
            line: entry.line,
            evidenceType: "node_port",
            semanticRole: "node_port",
            confidence: "high",
            explanation: `NodePort ${entry.nodePort} routes to Service port ${entry.port ?? "unknown"}; it is a node access port, not the application port.`,
          }),
        });
      }
      if (typeof target === "number") {
        const targetRole = entry.name ? roleFromName(entry.name, "unknown") : "unknown";
        out.push({
          port: target,
          protocol: entry.protocol,
          role: targetRole,
          evidence: makeEvidence({
            sourcePath: service.path,
            field: "Service.spec.ports.targetPort",
            line: entry.line,
            evidenceType: "service_target",
            semanticRole: targetRole,
            confidence: binding.workload ? bindingConfidence : "low",
            explanation:
              target === entry.port && entry.targetPort === null
                ? `No targetPort is declared, so Kubernetes defaults the target to Service port ${target}; ${bindingNote}.`
                : `Service port ${entry.port ?? "unknown"} targets container port ${target}; ${bindingNote}.`,
          }),
        });
      } else if (typeof target === "string") {
        const resolved = workload
          ? workload.containers
              .flatMap((container) => container.ports.map((port) => ({ container: container.name, ...port })))
              .find((port) => port.name === target && port.port !== null)
          : null;
        if (resolved?.port !== null && resolved?.port !== undefined) {
          const resolvedRole = roleFromName(target, roleFromName(resolved.name, "unknown"));
          out.push({
            port: resolved.port,
            protocol: resolved.protocol,
            role: resolvedRole,
            evidence: makeEvidence({
              sourcePath: service.path,
              field: "Service.spec.ports.targetPort",
              line: entry.line,
              evidenceType: "service_target",
              semanticRole: resolvedRole,
              confidence: bindingConfidence,
              explanation: `Named targetPort ${target} resolves to container port ${resolved.port}; ${bindingNote}.`,
            }),
          });
        } else {
          out.push({
            port: entry.port ?? 0,
            protocol: entry.protocol,
            role: "unknown",
            evidence: makeEvidence({
              sourcePath: service.path,
              field: "Service.spec.ports.targetPort",
              line: entry.line,
              evidenceType: "service_target",
              semanticRole: "unknown",
              confidence: "low",
              explanation: `Named targetPort ${target} has no matching container port in the analyzed files, so its numeric target is unknown.`,
            }),
          });
        }
      }
    }
  }
  return mergePortFindings(out.filter((finding) => finding.port > 0));
}

export function collectComposePortFindings(
  services: ComposeService[],
  applicationTargets: Set<number>,
): PortFinding[] {
  const out: PortFinding[] = [];
  for (const service of services) {
    const infraRole = infrastructureRole(service.name, service.image);
    const locallyBuilt = service.build !== null && service.command.length > 0 && infraRole === null;
    const isApplicationService =
      locallyBuilt ||
      (applicationTargets.size > 0 && service.ports.some((port) => port.target !== null && applicationTargets.has(port.target)));
    for (const port of service.ports) {
      if (port.target !== null) {
        const role = infraRole ?? (isApplicationService ? "unknown" : "unknown");
        out.push({
          port: port.target,
          protocol: port.protocol,
          role,
          evidence: makeEvidence({
            sourcePath: service.path,
            field: `services.${service.name}.ports`,
            line: port.line,
            evidenceType: "compose_mapping",
            semanticRole: role,
            confidence: isApplicationService ? "medium" : "low",
            explanation:
              infraRole !== null
                ? `Compose service ${service.name} maps container port ${port.target}; its image/name identifies ${infraRole} infrastructure, not the application port.`
                : `Compose service ${service.name} maps container port ${port.target}; a bare mapping does not prove which workload is the application.`,
          }),
        });
      }
      if (port.published !== null) {
        out.push({
          port: port.published,
          protocol: port.protocol,
          role: "service",
          evidence: makeEvidence({
            sourcePath: service.path,
            field: `services.${service.name}.ports`,
            line: port.line,
            evidenceType: "compose_mapping",
            semanticRole: "service",
            confidence: "medium",
            explanation: `Compose publishes host port ${port.published} for service ${service.name}; this is access configuration, not the container's application port.`,
          }),
        });
      }
    }
  }
  return mergePortFindings(out.filter((finding) => finding.port > 0));
}

export function collectHelmValuePorts(
  values: unknown,
  sourcePath: string,
  disabledPaths: Set<string> = new Set(),
): PortFinding[] {
  const out: PortFinding[] = [];
  const visit = (value: unknown, path: string[]): void => {
    if (out.length > 200) return;
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 65536) {
      const dotted = path.join(".");
      if (disabledPaths.has(dotted)) return;
      const role = helmValueRole(path);
      if (!role) return;
      out.push({
        port: value,
        protocol: "TCP",
        role: role.role,
        evidence: makeEvidence({
          sourcePath,
          field: `values.${dotted}`,
          evidenceType: "helm_value",
          semanticRole: role.role,
          confidence: "medium",
          explanation: role.explanation,
        }),
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) visit(item, [...path, key]);
    }
  };
  visit(values, []);
  return mergePortFindings(out);
}

function helmValueRole(path: string[]): { role: PortRole; explanation: string } | null {
  const dotted = path.join(".").toLowerCase();
  const leaf = path[path.length - 1]?.toLowerCase() ?? "";
  if (/(^|\.)(nodeport|node_port)(s)?$/.test(dotted)) {
    return { role: "node_port", explanation: `Helm value ${dotted} configures node access, not the container application port.` };
  }
  if (/(^|\.)(externalport|external_port|hostport|host_port|publishedport|published_port)$/.test(dotted)) {
    return { role: "service", explanation: `Helm value ${dotted} configures externally published access, not the container target by itself.` };
  }
  if (/metric|prometheus|statsd/.test(dotted)) {
    return { role: "metrics", explanation: `Helm value ${dotted} configures a metrics listener.` };
  }
  if (/grpc/.test(dotted)) {
    return { role: "grpc", explanation: `Helm value ${dotted} configures a gRPC listener.` };
  }
  if (/postgres|postgresql|mysql|mariadb|mongo|mssql|oracle|database/.test(dotted)) {
    return { role: "database", explanation: `Helm value ${dotted} configures database connectivity, not the application listener.` };
  }
  if (/redis|memcached|cache/.test(dotted)) {
    return { role: "cache", explanation: `Helm value ${dotted} configures cache connectivity, not the application listener.` };
  }
  if (/kafka|rabbit|nats|amqp|queue|stream/.test(dotted)) {
    return { role: "message_queue", explanation: `Helm value ${dotted} configures messaging connectivity, not the application listener.` };
  }
  if (/otel|collector|jaeger|tempo|loki|grafana|trac|telemetry/.test(dotted)) {
    return { role: "telemetry", explanation: `Helm value ${dotted} configures telemetry export, not the application listener.` };
  }
  if (/https|tls|secure/.test(dotted) && /port/.test(dotted)) {
    return { role: "application_https", explanation: `Helm value ${dotted} configures an application HTTPS listener.` };
  }
  if (/http|https|app|web|api|server|service|container|target|listen/.test(dotted) && /port$/.test(leaf)) {
    return { role: "application_http", explanation: `Helm value ${dotted} configures an application HTTP listener.` };
  }
  return null;
}

export function collectCommandPorts(commands: CommandPort[]): PortFinding[] {
  return mergePortFindings(
    commands.map((command) => ({
      port: command.port,
      protocol: "TCP" as PortProtocol,
      role: command.role,
      evidence: makeEvidence({
        sourcePath: command.sourcePath,
        field: command.field,
        line: command.line,
        evidenceType: "container_command_argument",
        semanticRole: command.role,
        confidence: command.confidence,
        explanation: `${command.command}: ${command.explanation}`,
      }),
    })),
  );
}

export function collectDockerExposes(
  dockers: { path: string; exposes: { port: number; protocol: PortProtocol; line?: number }[]; productionCommand: string | null }[],
): PortFinding[] {
  return mergePortFindings(
    dockers.flatMap((docker) =>
      docker.exposes.map((expose) => ({
        port: expose.port,
        protocol: expose.protocol,
        role: "unknown" as PortRole,
        evidence: makeEvidence({
          sourcePath: docker.path,
          field: "EXPOSE",
          line: expose.line,
          evidenceType: "docker_expose",
          semanticRole: "unknown",
          confidence: (docker.productionCommand ? "medium" : "low") as EvidenceConfidence,
          explanation: docker.productionCommand
            ? `Image metadata exposes port ${expose.port} for an image with a known default command; EXPOSE alone does not identify the application listener.`
            : `Image metadata exposes port ${expose.port}; without a default command its application role is unknown.`,
        }),
      })),
    ),
  );
}

export function collectFrameworkPorts(frameworks: FrameworkPort[]): PortFinding[] {
  return mergePortFindings(
    frameworks.map((framework) => ({
      port: framework.port,
      protocol: framework.protocol ?? "TCP",
      role: "application_http" as PortRole,
      evidence: makeEvidence({
        sourcePath: framework.sourcePath,
        field: framework.field,
        line: framework.line,
        evidenceType: "framework_configuration",
        semanticRole: "application_http",
        confidence: "high",
        explanation: framework.explanation,
      }),
    })),
  );
}

export function selectApplicationPort(
  findings: PortFinding[],
  probedPorts: Set<number> = new Set(),
): ApplicationPortSelection {
  const candidates = findings.filter(
    (finding) => finding.role === "application_http" || finding.role === "application_https",
  );
  if (candidates.length === 0) {
    return {
      selected: { value: null, provenance: "not_detected" },
      alternatives: [],
      ambiguous: false,
    };
  }
  const bestByPort = new Map<number, { score: number; finding: PortFinding }>();
  for (const finding of candidates) {
    const score = evidenceScore(finding) + (probedPorts.has(finding.port) ? 40 : 0);
    const existing = bestByPort.get(finding.port);
    if (!existing || score > existing.score) bestByPort.set(finding.port, { score, finding });
  }
  const ranked: { port: number; score: number; finding: PortFinding }[] = [];
  bestByPort.forEach((entry, port) => {
    ranked.push({ port, score: entry.score, finding: entry.finding });
  });
  ranked.sort((a, b) => b.score - a.score || a.port - b.port);
  const best = ranked[0].score;
  const tied = ranked.filter((item) => item.score === best);
  if (tied.length > 1) {
    return {
      selected: { value: null, provenance: "unknown" },
      alternatives: tied.map((item) => item.finding),
      ambiguous: true,
    };
  }
  return {
    selected: { value: ranked[0].port, provenance: "detected" },
    alternatives: [],
    ambiguous: false,
  };
}

export type PortGroups = {
  application: PortFinding[];
  metrics: PortFinding[];
  grpc: PortFinding[];
  infrastructure: PortFinding[];
  network: PortFinding[];
  other: PortFinding[];
};

function frameworkPortPatterns(language: string | null): RegExp[] {
  if (language === "Go") {
    return [
      /\b(?:fs|flag|pflag)\.(?:Int|IntP|Uint|UintP)\(\s*"(?:port|http-port|https-port|server-port)"\s*,\s*(\d{2,5})/g,
      /\b(?:fs|flag|pflag)\.String\(\s*"(?:port|http-port|https-port|server-port)"\s*,\s*"(\d{2,5})"/g,
    ];
  }
  if (language === "Node.js") {
    return [
      /\.listen\(\s*["']?(\d{2,5})["']?/g,
      /\bserver\.port\s*[:=]\s*["']?(\d{2,5})["']?/gi,
    ];
  }
  if (language === "Python") {
    return [
      /\.run\([^)]*\bport\s*=\s*["']?(\d{2,5})["']?/g,
      /^\s*(?:PORT|HTTP_PORT|SERVER_PORT)\s*=\s*["']?(\d{2,5})["']?/gm,
    ];
  }
  if (language === "Java") {
    return [/server\.port\s*=\s*(\d{2,5})/g, /\.setPort\(\s*(\d{2,5})\s*\)/g];
  }
  if (language === "Rust") {
    return [/\.bind\(\s*"(?:[^"\s]+:)?(\d{2,5})"/g, /\.bind\(\s*\(\s*"[^"]+"\s*,\s*(\d{2,5})\s*\)/g];
  }
  return [];
}

/** Explicit server ports declared in application source or runtime config. */
export function extractFrameworkPorts(
  files: Record<string, string | null>,
  language: string | null,
): FrameworkPort[] {
  const patterns = frameworkPortPatterns(language);
  if (patterns.length === 0) return [];
  const out: FrameworkPort[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string" || content === "") continue;
    if (!/\.(go|js|jsx|ts|tsx|py|java|rs|properties|ya?ml|toml|cfg|ini)$/i.test(path)) continue;
    for (const pattern of patterns) {
      for (const match of Array.from(content.matchAll(new RegExp(pattern.source, pattern.flags)))) {
        const port = Number.parseInt(match[1], 10);
        if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
        const line = content.split("\n").findIndex((line) => line.includes(match[0])) + 1;
        out.push({
          port,
          sourcePath: path,
          field: "server port",
          ...(line > 0 ? { line } : {}),
          explanation: `Runtime configuration declares server port ${port}.`,
        });
      }
    }
    if (out.length > 20) break;
  }
  return out;
}

export function groupPortFindings(findings: PortFinding[]): PortGroups {
  const groups: PortGroups = {
    application: [],
    metrics: [],
    grpc: [],
    infrastructure: [],
    network: [],
    other: [],
  };
  for (const finding of findings) {
    if (finding.role === "application_http" || finding.role === "application_https") groups.application.push(finding);
    else if (finding.role === "metrics" || finding.role === "telemetry") groups.metrics.push(finding);
    else if (finding.role === "grpc") groups.grpc.push(finding);
    else if (finding.role === "database" || finding.role === "cache" || finding.role === "message_queue") {
      groups.infrastructure.push(finding);
    } else if (finding.role === "service" || finding.role === "ingress" || finding.role === "node_port") {
      groups.network.push(finding);
    } else groups.other.push(finding);
  }
  return groups;
}

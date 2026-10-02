/**
 * Kubernetes object extraction for repository evidence.
 *
 * This module builds relationships, not flat token matches:
 *
 * - workload containers expose named or numbered `containerPort` values;
 * - Services expose `port`, `targetPort`, and `nodePort`;
 * - selectors are matched against Pod-template labels when they are literal;
 * - Helm templates in the same chart can be correlated through their shared
 *   default values without executing the chart.
 *
 * Secret and ConfigMap payloads are never retained. Only key names needed to
 * identify a reference are returned; values stay in the parsed document and
 * are discarded with it.
 */
import type { EvidenceConfidence, PortProtocol } from "./types";
import { prepareHelmTemplate } from "./helm";
import {
  asInteger,
  asList,
  asRecord,
  asText,
  getPath,
  lineOf,
  parseManifestDocuments,
  type YamlValue,
} from "./manifests";

export type K8sProbeMechanism = "http" | "exec" | "tcp" | "grpc" | "unknown";
export type K8sProbeKind = "liveness" | "readiness" | "startup";

export type K8sProbe = {
  kind: K8sProbeKind;
  mechanism: K8sProbeMechanism;
  path: string | null;
  port: number | string | null;
  command: string[];
};

export type K8sContainerPort = {
  name: string | null;
  port: number | null;
  protocol: PortProtocol;
  line?: number;
};

export type K8sEnvValue = {
  name: string;
  kind: "literal" | "valueFrom" | "secret" | "config";
  /** A referenced service hostname/alias, when one can be identified. */
  reference?: string | null;
};

export type K8sContainer = {
  name: string | null;
  image: string | null;
  command: string[] | null;
  args: string[] | null;
  ports: K8sContainerPort[];
  envNames: string[];
  envValues: K8sEnvValue[];
  probes: K8sProbe[];
};

export type K8sWorkload = {
  path: string;
  kind: string;
  name: string | null;
  scope: string;
  podLabels: Record<string, string>;
  containers: K8sContainer[];
};

export type K8sServicePort = {
  name: string | null;
  port: number | null;
  targetPort: number | string | null;
  nodePort: number | null;
  protocol: PortProtocol;
  line?: number;
};

export type K8sService = {
  path: string;
  name: string | null;
  scope: string;
  type: string | null;
  selector: Record<string, string>;
  ports: K8sServicePort[];
};

export type K8sIngressBackend = {
  path: string;
  serviceName: string | null;
  servicePort: number | string | null;
};

export type K8sConfigReference = {
  kind: "configmap" | "secret";
  path: string;
  name: string | null;
  keys: string[];
};

export type K8sObjects = {
  workloads: K8sWorkload[];
  services: K8sService[];
  ingressBackends: K8sIngressBackend[];
  configs: K8sConfigReference[];
};

export type ServiceBinding = {
  service: K8sService;
  workload: K8sWorkload | null;
  exactSelector: boolean;
  sameScope: boolean;
};

const WORKLOAD_KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "ReplicaSet",
  "ReplicationController",
  "Job",
  "CronJob",
  "Pod",
]);

function protocolOf(value: unknown): PortProtocol {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (text === "UDP") return "UDP";
  if (text === "SCTP") return "SCTP";
  if (text === "TCP" || text === "") return "TCP";
  return "UNKNOWN";
}

function scopeFor(path: string): string {
  const marker = "/templates/";
  const templateIndex = path.lastIndexOf(marker);
  if (templateIndex > 0) return `chart:${path.slice(0, templateIndex)}`;
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return "file:root";
  return `directory:${path.slice(0, slash)}`;
}

function stringMap(value: unknown): Record<string, string> {
  const record = asRecord(value);
  const out: Record<string, string> = {};
  if (!record) return out;
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string" && item.trim() !== "") out[key] = item;
  }
  return out;
}

function stringList(value: unknown): string[] | null {
  const list = asList(value);
  if (!Array.isArray(value) || list.length === 0) return null;
  const out: string[] = [];
  for (const item of list) {
    const text = asText(item);
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

function podSpecFor(kind: string, root: Record<string, YamlValue>): Record<string, YamlValue> | null {
  if (kind === "Pod") return asRecord(root.spec);
  if (kind === "CronJob") {
    return asRecord(getPath(root, ["spec", "jobTemplate", "spec", "template", "spec"]));
  }
  if (kind === "Job") {
    return asRecord(getPath(root, ["spec", "template", "spec"]));
  }
  const template = asRecord(getPath(root, ["spec", "template", "spec"]));
  if (template) return template;
  // Accept a simplified workload shape with containers directly under `spec`.
  // Full manifests use a Pod template; this fallback exists for partial
  // fixtures, not as a second Kubernetes semantic.
  const direct = asRecord(root.spec);
  if (direct && Array.isArray(direct.containers)) return direct;
  return null;
}

function probeFrom(kind: K8sProbeKind, value: unknown): K8sProbe | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.httpGet) {
    const target = asRecord(record.httpGet);
    const path = target ? asText(target.path) : null;
    const port = target ? target.port : undefined;
    return {
      kind,
      mechanism: "http",
      path: path && path.startsWith("/") ? path : null,
      port: typeof port === "number" || typeof port === "string" ? port : null,
      command: [],
    };
  }
  if (record.exec) {
    const target = asRecord(record.exec);
    const command = target ? stringList(target.command) : null;
    if (!command) return null;
    return { kind, mechanism: "exec", path: pathFromExecCommand(command), port: portFromExecCommand(command), command };
  }
  if (record.tcpSocket) {
    const target = asRecord(record.tcpSocket);
    const port = target ? target.port : undefined;
    return {
      kind,
      mechanism: "tcp",
      path: null,
      port: typeof port === "number" || typeof port === "string" ? port : null,
      command: [],
    };
  }
  if (record.grpc) {
    const target = asRecord(record.grpc);
    const port = target ? target.port : undefined;
    return {
      kind,
      mechanism: "grpc",
      path: null,
      port: typeof port === "number" || typeof port === "string" ? port : null,
      command: [],
    };
  }
  return null;
}

function serviceReferenceFromValue(value: string): string | null {
  const text = value.trim();
  if (!text || /^\$\(?\{?[A-Za-z_][A-Za-z0-9_]*\}?\)?$/.test(text)) return null;
  const m = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/)?(?:[^@/\s]+@)?([^/\s:;]+)(?::\d+)?(?:\/|$)/.exec(text);
  if (!m) return null;
  const host = m[1].toLowerCase();
  // Only retain something shaped like a hostname/service name. Arbitrary
  // secret material must never be carried forward as a "reference".
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host)) return null;
  if (!host.includes(".") && !host.includes("-") && host.length < 3) return null;
  return host;
}

function pathFromExecCommand(command: string[]): string | null {
  const joined = command.join(" ");
  const m = /(?:https?:\/\/[^\s/:]+(?::\d+)?|(?:[A-Za-z0-9_.-]+:\d+))(\/[^\s"'`]*)?/i.exec(joined);
  if (!m) return null;
  const path = m[1] ?? "/";
  return path.startsWith("/") ? path.split(/[?#]/, 1)[0] : `/${path.split(/[?#]/, 1)[0]}`;
}

function portFromExecCommand(command: string[]): number | null {
  const joined = command.join(" ");
  const m = /(?:https?:\/\/[^\s/:]+|:)([0-9]{2,5})(?![0-9])/i.exec(joined);
  if (!m) return null;
  const port = Number.parseInt(m[1], 10);
  return port > 0 && port < 65536 ? port : null;
}

function parseContainer(value: unknown, raw: string): K8sContainer | null {
  const record = asRecord(value);
  if (!record) return null;
  const ports = asList(record.ports)
    .map((entry) => {
      const item = asRecord(entry);
      if (!item) return null;
      const port = asInteger(item.containerPort);
      const line = lineOf(raw, /containerPort\s*:/);
      return {
        name: asText(item.name),
        port,
        protocol: protocolOf(item.protocol),
        ...(line === undefined ? {} : { line }),
      };
    })
    .filter((entry): entry is K8sContainerPort => entry !== null);
  const envNames: string[] = [];
  const envValues: K8sEnvValue[] = [];
  for (const entry of asList(record.env)) {
    const item = asRecord(entry);
    const name = item ? asText(item.name) : null;
    if (!item || !name) continue;
    envNames.push(name);
    const valueFrom = asRecord(item.valueFrom);
    if (valueFrom) {
      envValues.push({ name, kind: "valueFrom" });
      continue;
    }
    const value = asText(item.value);
    if (value === null) {
      envValues.push({ name, kind: "literal" });
      continue;
    }
    // Only a hostname-shaped reference is retained. Literal secret material,
    // passwords, tokens, and connection-string credentials stay in the parsed
    // document and are discarded with it.
    const reference = serviceReferenceFromValue(value);
    envValues.push({ name, kind: reference ? "literal" : "literal", ...(reference ? { reference } : {}) });
  }
  const probes: K8sProbe[] = [];
  for (const kind of ["liveness", "readiness", "startup"] as const) {
    const probe = probeFrom(kind === "liveness" ? "liveness" : kind === "readiness" ? "readiness" : "startup", record[`${kind}Probe`]);
    if (probe) probes.push(probe);
  }
  return {
    name: asText(record.name),
    image: asText(record.image),
    command: stringList(record.command),
    args: stringList(record.args),
    ports,
    envNames,
    envValues,
    probes,
  };
}

function parseServicePorts(value: unknown, raw: string): K8sServicePort[] {
  return asList(value)
    .map((entry) => {
      const item = asRecord(entry);
      if (!item) return null;
      const target = item.targetPort;
      const line = lineOf(raw, /(^\s*-\s*port\s*:|^\s*port\s*:|targetPort\s*:|nodePort\s*:)/m);
      return {
        name: asText(item.name),
        port: asInteger(item.port),
        targetPort:
          typeof target === "number" || typeof target === "string"
            ? (typeof target === "string" && target.trim() === "" ? null : target)
            : null,
        nodePort: asInteger(item.nodePort),
        protocol: protocolOf(item.protocol),
        ...(line === undefined ? {} : { line }),
      };
    })
    .filter((entry): entry is K8sServicePort => entry !== null);
}

function parseIngressBackends(kind: string, root: Record<string, YamlValue>, path: string): K8sIngressBackend[] {
  const out: K8sIngressBackend[] = [];
  if (kind === "Ingress") {
    const rules = asList(getPath(root, ["spec", "rules"]));
    for (const rule of rules) {
      const paths = asList(getPath(asRecord(rule) ?? undefined, ["http", "paths"]));
      for (const item of paths) {
        const backend = asRecord(getPath(asRecord(item) ?? undefined, ["backend", "service"]));
        if (!backend) continue;
        const port = asRecord(backend.port);
        out.push({
          path,
          serviceName: asText(backend.name),
          servicePort: port ? (asInteger(port.number) ?? asText(port.name)) : null,
        });
      }
    }
    return out;
  }
  if (kind === "HTTPRoute" || kind === "GRPCRoute") {
    const rules = asList(getPath(root, ["spec", "rules"]));
    for (const rule of rules) {
      const backends = asList(getPath(asRecord(rule) ?? undefined, ["backendRefs"]));
      for (const backend of backends) {
        const item = asRecord(backend);
        if (!item) continue;
        out.push({ path, serviceName: asText(item.name), servicePort: asInteger(item.port) });
      }
    }
  }
  return out;
}

function parseConfig(kind: "configmap" | "secret", root: Record<string, YamlValue>, path: string): K8sConfigReference {
  const data = asRecord(root.data) ?? {};
  return {
    kind,
    path,
    name: asText(root.metadata ? asRecord(root.metadata)?.name : null),
    // Keys identify a reference. Values — especially Secret payloads — are
    // deliberately never returned.
    keys: Object.keys(data),
  };
}

export function extractKubernetesObjects(files: Record<string, string | null>): K8sObjects {
  const workloads: K8sWorkload[] = [];
  const services: K8sService[] = [];
  const ingressBackends: K8sIngressBackend[] = [];
  const configs: K8sConfigReference[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string" || content === "") continue;
    if (!/\.(ya?ml|json)$/i.test(path)) continue;
    let text = content;
    if (path.includes("/templates/")) {
      text = prepareHelmTemplate(path, content, files).text;
    }
    for (const doc of parseManifestDocuments(path, text)) {
      const root = asRecord(doc.value);
      if (!root) continue;
      const kind = asText(root.kind);
      if (!kind) continue;
      const metadata = asRecord(root.metadata) ?? {};
      const name = asText(metadata.name);
      const scope = scopeFor(path);

      if (WORKLOAD_KINDS.has(kind)) {
        const podSpec = podSpecFor(kind, root);
        const templateMetadata = asRecord(getPath(root, kind === "Pod" ? ["metadata"] : ["spec", "template", "metadata"])) ?? {};
        const containers = asList(podSpec?.containers)
          .map((entry) => parseContainer(entry, text))
          .filter((entry): entry is K8sContainer => entry !== null);
        workloads.push({
          path,
          kind,
          name,
          scope,
          podLabels: stringMap(templateMetadata.labels),
          containers,
        });
        continue;
      }
      if (kind === "Service") {
        const spec = asRecord(root.spec) ?? {};
        services.push({
          path,
          name,
          scope,
          type: asText(spec.type),
          selector: stringMap(spec.selector),
          ports: parseServicePorts(spec.ports, text),
        });
        continue;
      }
      if (kind === "Ingress" || kind === "HTTPRoute" || kind === "GRPCRoute") {
        ingressBackends.push(...parseIngressBackends(kind, root, path));
        continue;
      }
      if (kind === "ConfigMap") {
        configs.push(parseConfig("configmap", root, path));
        continue;
      }
      if (kind === "Secret") {
        configs.push(parseConfig("secret", root, path));
      }
    }
  }
  return { workloads, services, ingressBackends, configs };
}

export function bindServicesToWorkloads(objects: K8sObjects): ServiceBinding[] {
  return objects.services.map((service) => {
    const selectorEntries = Object.entries(service.selector);
    if (selectorEntries.length > 0) {
      const match = objects.workloads.find((workload) =>
        selectorEntries.every(([key, value]) => workload.podLabels[key] === value),
      );
      if (match) return { service, workload: match, exactSelector: true, sameScope: match.scope === service.scope };
    }
    const scoped = objects.workloads.filter((workload) => workload.scope === service.scope);
    if (scoped.length === 1) {
      return { service, workload: scoped[0], exactSelector: false, sameScope: true };
    }
    return { service, workload: null, exactSelector: false, sameScope: false };
  });
}

export function findNamedContainerPort(
  workload: K8sWorkload | null,
  name: string,
): { container: string | null; port: number | null } | null {
  if (!workload) return null;
  for (const container of workload.containers) {
    for (const port of container.ports) {
      if (port.name === name && port.port !== null) {
        return { container: container.name, port: port.port };
      }
    }
  }
  return null;
}

export type { EvidenceConfidence };

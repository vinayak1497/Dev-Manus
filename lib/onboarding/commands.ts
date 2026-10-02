/**
 * Production, build, and development command inference.
 *
 * The three commands answer different questions: how developers run the
 * service locally, how its artifact is built, and how the deployed workload
 * starts it. They are therefore detected from different sources and never
 * fall back into one another.
 *
 * In particular, a `package.json` script is evidence only for Node.js. A Go,
 * Python, Java, or Rust repository never receives an `npm` command from the
 * analyzer, no matter which deployment files surround it.
 */
import type {
  DetectedCommand,
  EvidenceConfidence,
  PortRole,
  RuntimeCommandFindings,
} from "./types";
import type { ComposeService, DockerfileInfo } from "./containers";
import type { K8sContainer, K8sWorkload } from "./kubernetes";
import { lineOf, quoteShell } from "./manifests";

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

function notDetected(kind: DetectedCommand["provenance"] = "not_detected"): DetectedCommand {
  return { command: null, provenance: kind };
}

function validPortText(text: string): number | null {
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number.parseInt(text, 10);
  return port > 0 && port < 65536 ? port : null;
}

function commandPortRole(flag: string): PortRole | null {
  const name = flag.toLowerCase();
  if (/(metric|prometheus|statsd|otel)/.test(name)) return "metrics";
  if (/grpc/.test(name)) return "grpc";
  if (/(cache|backend|database|db|redis|mongo|queue|broker)/.test(name)) return "unknown";
  if (/(https|tls|secure)/.test(name)) return "application_https";
  if (/(^|-)port(s)?($|-) |http|listen|bind|server/.test(` ${name} `)) return "application_http";
  if (/^p$/.test(name)) return "application_http";
  return null;
}

export function commandPortsFor(
  words: string[],
  input: { sourcePath: string; field?: string; line?: number; confidence: EvidenceConfidence; command: string },
): CommandPort[] {
  const out: CommandPort[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const assignment = /^(--?[A-Za-z][A-Za-z0-9_-]*)=(.+)$/.exec(word);
    const flag = assignment ? assignment[1].replace(/^-+/, "") : word.replace(/^-+/, "");
    const inline = assignment ? assignment[2] : null;
    const candidates: string[] = [];
    if (inline !== null) candidates.push(inline);
    else if (/^(port|p|listen|bind|server-port|http-port|https-port)$/i.test(flag)) {
      const next = words[i + 1];
      if (next && !next.startsWith("-")) candidates.push(next);
    }
    const role = commandPortRole(flag);
    if (!role || role === "unknown") continue;
    for (const candidate of candidates) {
      const direct = validPortText(candidate.replace(/^["']|["']$/g, ""));
      if (direct !== null) {
        out.push({
          port: direct,
          role,
          sourcePath: input.sourcePath,
          ...(input.field === undefined ? {} : { field: input.field }),
          ...(input.line === undefined ? {} : { line: input.line }),
          confidence: input.confidence,
          command: input.command,
          explanation: `Command option ${flag} sets a ${role.replace("_", " ")} listener to ${direct}.`,
        });
        continue;
      }
      const url = /^(?:https?:\/\/[^\s/:]+|\[::\]|0\.0\.0\.0|localhost)(?::(\d{2,5}))?/i.exec(candidate);
      if (url?.[1]) {
        const port = validPortText(url[1]);
        if (port !== null) {
          out.push({
            port,
            role,
            sourcePath: input.sourcePath,
            ...(input.field === undefined ? {} : { field: input.field }),
            ...(input.line === undefined ? {} : { line: input.line }),
            confidence: input.confidence,
            command: input.command,
            explanation: `Command option ${flag} binds ${candidate}, identifying ${role.replace("_", " ")} port ${port}.`,
          });
        }
      }
    }
  }
  return out;
}

export function primaryContainer(workload: K8sWorkload): K8sContainer | null {
  if (workload.containers.length === 0) return null;
  if (workload.containers.length === 1) return workload.containers[0];
  const withCommands = workload.containers.filter(
    (container) => (container.command?.length ?? 0) > 0 || (container.args?.length ?? 0) > 0,
  );
  if (withCommands.length === 1) return withCommands[0];
  const withProbes = workload.containers.filter((container) => container.probes.length > 0);
  if (withProbes.length === 1) return withProbes[0];
  return null;
}

function workloadCommand(container: K8sContainer): string[] | null {
  if ((container.command?.length ?? 0) > 0) return [...(container.command ?? []), ...(container.args ?? [])];
  // `args` without `command` modifies the image's entrypoint. Without reading
  // that image configuration — which the repository does not contain — the
  // executable is unknown, so no production command is claimed.
  return null;
}

export function kubernetesProductionCommands(
  workloads: K8sWorkload[],
  files: Record<string, string | null>,
): DetectedCommand[] {
  const out: DetectedCommand[] = [];
  for (const workload of workloads) {
    const container = primaryContainer(workload);
    const words = container ? workloadCommand(container) : null;
    if (!container || !words || words.length === 0) continue;
    const command = quoteShell(words);
    const helmTemplate = workload.path.includes("/templates/");
    const raw = files[workload.path] ?? "";
    const line = typeof files[workload.path] === "string" ? commandEvidenceLine(workload.path, files) : undefined;
    out.push({
      command,
      provenance: "detected",
      strategy: helmTemplate ? "helm" : "kubernetes",
      sourcePath: workload.path,
      field: container.command?.length ? "containers.command" : "containers.args",
      ...(line === undefined ? {} : { line }),
      sourceKind: helmTemplate ? "helm_default" : "kubernetes_container",
      confidence: helmTemplate ? "medium" : "high",
      explanation: helmTemplate
        ? `Helm's default workload command resolves to ${command}; an installed release can override these values.`
        : `Workload ${workload.name ?? "unnamed"} starts its primary container with ${command}.`,
    });
    void raw;
  }
  return out;
}

export function composeProductionCommands(services: ComposeService[]): DetectedCommand[] {
  const candidates = services.filter((service) => service.command.length > 0 && service.build !== null);
  if (candidates.length !== 1) return [];
  const service = candidates[0];
  return [
    {
      command: quoteShell(service.command),
      provenance: "detected",
      strategy: "compose",
      sourcePath: service.path,
      field: `services.${service.name}.command`,
      sourceKind: "compose_service",
      confidence: "medium",
      explanation: `Compose service ${service.name} builds locally and runs ${quoteShell(service.command)}.`,
    },
  ];
}

export function dockerProductionCommands(dockers: DockerfileInfo[]): DetectedCommand[] {
  return dockers
    .filter((docker) => docker.productionCommand !== null)
    .map((docker) => ({
      command: docker.productionCommand,
      provenance: "detected" as const,
      strategy: "dockerfile" as const,
      sourcePath: docker.path,
      field: "ENTRYPOINT/CMD",
      ...(docker.productionLine === undefined ? {} : { line: docker.productionLine }),
      sourceKind: "dockerfile" as const,
      confidence: "medium" as const,
      explanation: `The image's default ENTRYPOINT/CMD is ${docker.productionCommand}; Compose or Kubernetes can override it.`,
    }));
}

export function scriptRunner(packageManager: string | null, name: string): string | null {
  const pm = (packageManager ?? "").toLowerCase();
  if (pm === "yarn") return `yarn ${name}`;
  if (pm === "pnpm") return `pnpm ${name}`;
  if (pm === "bun") return `bun run ${name}`;
  if (pm === "npm") return name === "start" ? "npm start" : `npm run ${name}`;
  return null;
}

export function packageRuntimeCommands(input: {
  scripts: Record<string, string>;
  packageManager: string | null;
  sourcePath: string | null;
}): RuntimeCommandFindings {
  const production = input.scripts.start ? scriptRunner(input.packageManager, "start") : null;
  const build = input.scripts.build ? scriptRunner(input.packageManager, "build") : null;
  const development = input.scripts.dev ? scriptRunner(input.packageManager, "dev") : null;
  const sourceKind = "package_script" as const;
  return {
    development: development
      ? {
          command: development,
          provenance: "detected",
          sourcePath: input.sourcePath,
          field: "scripts.dev",
          sourceKind,
          confidence: "high",
          explanation: `package.json declares a dev script run as ${development}.`,
        }
      : notDetected(),
    build: build
      ? {
          command: build,
          provenance: "detected",
          sourcePath: input.sourcePath,
          field: "scripts.build",
          sourceKind,
          confidence: "high",
          explanation: `package.json declares a build script run as ${build}.`,
        }
      : notDetected(),
    production: production
      ? {
          command: production,
          provenance: "detected",
          strategy: "framework",
          sourcePath: input.sourcePath,
          field: "scripts.start",
          sourceKind,
          confidence: "high",
          explanation: `package.json declares a start script run as ${production}.`,
        }
      : notDetected(),
  };
}

export function dockerBuildCommand(dockers: DockerfileInfo[]): DetectedCommand {
  const build = dockers.flatMap((docker) =>
    docker.buildCommands.map((entry) => ({ ...entry, sourcePath: docker.path })),
  )[0];
  if (!build) return notDetected();
  return {
    command: build.command,
    provenance: "detected",
    sourcePath: build.sourcePath,
    field: "RUN",
    ...(build.line === undefined ? {} : { line: build.line }),
    sourceKind: "dockerfile",
    confidence: "high",
    explanation: `The Dockerfile builds the artifact with ${build.command}.`,
  };
}

export function productionCommandForStrategy(
  candidates: DetectedCommand[],
  strategy: string | null,
): DetectedCommand {
  const usable = candidates.filter((candidate) => candidate.command && candidate.provenance === "detected");
  if (strategy) {
    const match = usable.find((candidate) => candidate.strategy === strategy);
    if (match) return match;
  }
  const order = ["kubernetes", "helm", "compose", "dockerfile", "framework"];
  const sorted = [...usable].sort(
    (a, b) => order.indexOf(a.strategy ?? "unknown") - order.indexOf(b.strategy ?? "unknown"),
  );
  return sorted[0] ?? notDetected();
}

export function commandEvidenceLine(path: string, files: Record<string, string | null>): number | undefined {
  const text = files[path];
  if (typeof text !== "string") return undefined;
  return lineOf(text, /^\s*(?:-\s*)?(command|args)\s*:/m);
}

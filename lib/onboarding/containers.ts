/**
 * Dockerfile and Docker Compose evidence.
 *
 * Both formats are parsed as data. Shell words are split without variable
 * expansion or execution; environment values are inspected transiently only
 * to identify references to another service, and secret payloads are never
 * returned as findings.
 */
import {
  asList,
  asRecord,
  asText,
  lineOf,
  quoteShell,
  splitShellWords,
  type YamlValue,
} from "./manifests";
import { parseYamlDocuments } from "./yaml";
import type { PortProtocol } from "./types";

export type DockerfilePort = {
  port: number;
  protocol: PortProtocol;
  line?: number;
};

export type DockerfileInfo = {
  path: string;
  exposes: DockerfilePort[];
  entrypoint: string[] | null;
  command: string[] | null;
  productionCommand: string | null;
  productionLine?: number;
  buildCommands: { command: string; line?: number }[];
};

export type ComposePort = {
  target: number | null;
  published: number | null;
  protocol: PortProtocol;
  line?: number;
};

export type ComposeService = {
  name: string;
  path: string;
  image: string | null;
  build: string | null;
  command: string[];
  commandLine?: number;
  envNames: string[];
  referencedServices: string[];
  dependsOn: string[];
  ports: ComposePort[];
};

function validPort(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null;
  const port = Number.parseInt(value, 10);
  return port > 0 && port < 65536 ? port : null;
}

function protocolOf(value: string | null): PortProtocol {
  const protocol = (value ?? "tcp").trim().toLowerCase();
  if (protocol === "udp") return "UDP";
  if (protocol === "sctp") return "SCTP";
  if (protocol === "tcp") return "TCP";
  return "UNKNOWN";
}

function parseJsonWords(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed as string[];
    }
  } catch {
    return null;
  }
  return null;
}

function joinContinuedLines(text: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const rawLines = text.split("\n");
  let current = "";
  let start = 1;
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (line.trimEnd().endsWith("\\") && !line.trimEnd().endsWith("\\\\")) {
      if (current === "") start = i + 1;
      current += `${line.trimEnd().slice(0, -1)} `;
      continue;
    }
    if (current === "") {
      if (line.trim() !== "" && !line.trimStart().startsWith("#")) out.push({ text: line, line: i + 1 });
    } else {
      out.push({ text: `${current}${line}`, line: start });
      current = "";
    }
  }
  return out;
}

function commandWords(text: string): string[] {
  return parseJsonWords(text) ?? splitShellWords(text);
}

function isBuildCommand(words: string[]): boolean {
  const text = words.join(" ").toLowerCase();
  return (
    /(^|\s)(npm run build|yarn build|pnpm build|bun run build)(?=\s|$)/.test(text) ||
    /(^|\s)go build(\s|$)/.test(text) ||
    /(^|\s)cargo build(\s|$)/.test(text) ||
    /(^|\s)(mvn|mvnw|gradle|gradlew)(\s|$)/.test(text) ||
    /(^|\s)dotnet (build|publish)(\s|$)/.test(text)
  );
}

export function parseDockerfile(path: string, text: string): DockerfileInfo | null {
  const stages: {
    entrypoint: string[] | null;
    command: string[] | null;
    productionLine?: number;
    exposes: DockerfilePort[];
    buildCommands: { command: string; line?: number }[];
  }[] = [{ entrypoint: null, command: null, exposes: [], buildCommands: [] }];

  for (const { text: line, line: lineNumber } of joinContinuedLines(text)) {
    const match = /^\s*([A-Za-z]+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const instruction = match[1].toUpperCase();
    const argument = match[2].trim();
    if (instruction === "FROM") {
      stages.push({ entrypoint: null, command: null, exposes: [], buildCommands: [] });
      continue;
    }
    const stage = stages[stages.length - 1];
    if (instruction === "EXPOSE") {
      for (const token of splitShellWords(argument)) {
        const [portText, protocolText] = token.split("/");
        const port = validPort(portText);
        if (port !== null) {
          stage.exposes.push({
            port,
            protocol: protocolOf(protocolText ?? null),
            line: lineNumber,
          });
        }
      }
    } else if (instruction === "ENTRYPOINT") {
      stage.entrypoint = commandWords(argument);
      stage.productionLine = lineNumber;
    } else if (instruction === "CMD") {
      stage.command = commandWords(argument);
      stage.productionLine = lineNumber;
    } else if (instruction === "RUN") {
      const words = splitShellWords(argument);
      if (words.length > 0 && isBuildCommand(words)) {
        stage.buildCommands.push({ command: quoteShell(words), line: lineNumber });
      }
    }
  }

  const final = stages[stages.length - 1];
  const production = [...(final.entrypoint ?? []), ...(final.command ?? [])];
  return {
    path,
    exposes: final.exposes,
    entrypoint: final.entrypoint,
    command: final.command,
    productionCommand: production.length > 0 ? quoteShell(production) : null,
    ...(final.productionLine === undefined ? {} : { productionLine: final.productionLine }),
    buildCommands: final.buildCommands,
  };
}

function composeCommand(value: YamlValue | undefined): string[] {
  if (typeof value === "string") return splitShellWords(value);
  if (Array.isArray(value)) {
    const words = value.map(asText).filter((word): word is string => word !== null);
    return words;
  }
  return [];
}

function composeEnvironment(value: YamlValue | undefined): { names: string[]; text: string } {
  const names: string[] = [];
  const texts: string[] = [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    texts.push(String(value));
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue;
      const text = entry.trim();
      if (!text) continue;
      const key = text.split("=", 1)[0].trim();
      if (key) names.push(key);
      texts.push(text);
    }
  } else {
    const record = asRecord(value);
    if (record) {
      for (const [key, item] of Object.entries(record)) {
        names.push(key);
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
          texts.push(`${key}=${String(item)}`);
        }
      }
    }
  }
  return { names, text: texts.join("\n") };
}

function serviceHostReferences(text: string, services: string[]): string[] {
  const found = new Set<string>();
  const haystack = ` ${text} `;
  for (const service of services) {
    if (!service) continue;
    const patterns = [
      new RegExp(`://${service}(?::|/|$)`, "i"),
      new RegExp(`[=:@/\\s]${service}(?::|/|\\s|$)`, "i"),
    ];
    if (patterns.some((pattern) => pattern.test(haystack))) found.add(service);
  }
  return Array.from(found);
}

function parseShortPort(token: string, line?: number): ComposePort | null {
  const [portPart, protocolPart] = token.split("/");
  const segments = portPart.split(":");
  let published: number | null = null;
  let target: number | null = null;
  if (segments.length === 3) {
    published = validPort(segments[1]);
    target = validPort(segments[2]);
  } else if (segments.length === 2) {
    published = validPort(segments[0]);
    target = validPort(segments[1]);
  } else if (segments.length === 1) {
    target = validPort(segments[0]);
  } else {
    return null;
  }
  if (published === null && target === null) return null;
  return { target, published, protocol: protocolOf(protocolPart ?? null), ...(line === undefined ? {} : { line }) };
}

function parseComposePorts(value: YamlValue | undefined, raw: string): ComposePort[] {
  const out: ComposePort[] = [];
  const line = lineOf(raw, /^\s*(?:-\s*)?(?:target|published|ports?)\s*:/m);
  for (const entry of asList(value)) {
    if (typeof entry === "string") {
      const parsed = parseShortPort(entry.trim(), line);
      if (parsed) out.push(parsed);
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    const targetText = asText(record.target);
    const publishedText = asText(record.published);
    const target = targetText ? validPort(targetText) : null;
    const published = publishedText ? validPort(publishedText) : null;
    if (target === null && published === null) continue;
    out.push({
      target,
      published,
      protocol: protocolOf(asText(record.protocol)),
      ...(line === undefined ? {} : { line }),
    });
  }
  return out;
}

export function parseComposeServices(files: Record<string, string | null>): ComposeService[] {
  const out: ComposeService[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string" || content === "") continue;
    const base = path.split("/").pop() ?? "";
    if (!["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].includes(base)) continue;
    for (const doc of parseYamlDocuments(content)) {
      if (doc.error) continue;
      const root = asRecord(doc.value);
      const services = asRecord(root?.services);
      if (!services) continue;
      const names = Object.keys(services);
      for (const name of names) {
        const service = asRecord(services[name]);
        if (!service) continue;
        const build = service.build;
        const buildText =
          typeof build === "string"
            ? build
            : asText(asRecord(build)?.context) ?? (build !== undefined && build !== null ? "build" : null);
        const entrypoint = composeCommand(service.entrypoint);
        const command = composeCommand(service.command);
        const env = composeEnvironment(service.environment);
        const depends = asList(service.depends_on)
          .map(asText)
          .filter((item): item is string => item !== null);
        const dependsMap = asRecord(service.depends_on);
        const dependsOn = depends.length > 0 ? depends : dependsMap ? Object.keys(dependsMap) : [];
        out.push({
          name,
          path,
          image: asText(service.image),
          build: buildText,
          command: [...entrypoint, ...command],
          envNames: Array.from(new Set(env.names)),
          referencedServices: serviceHostReferences(
            `${env.text}\n${[...entrypoint, ...command].join(" ")}`,
            names.filter((candidate) => candidate !== name),
          ),
          dependsOn,
          ports: parseComposePorts(service.ports, content),
        });
      }
    }
  }
  return out;
}

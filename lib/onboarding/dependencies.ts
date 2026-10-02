/**
 * Dependency evidence tiers.
 *
 * Repository-wide presence is not runtime use. A port number, driver, or
 * optional chart proves that a service *could* be used. Only configuration
 * that ties the service to the analyzed application — an enabled deployment
 * option, an environment reference, or a workload/service relationship —
 * can mark it detected.
 */
import type {
  DependencyEvidenceTier,
  DependencyFinding,
  DependencyStatus,
  Evidence,
  SupportedDependencyService,
} from "./types";
export { dependencyStatusLabel } from "./status-labels";
import { makeEvidence } from "./evidence";
import type { ComposeService } from "./containers";
import { loadHelmChart, parseChartDependencies, prepareHelmTemplate } from "./helm";
import type { K8sObjects } from "./kubernetes";
import { asRecord, getPath, type YamlValue } from "./manifests";
import type { PortFinding } from "./types";
import { parseYamlDocuments } from "./yaml";

const SERVICE_ALIASES: Record<SupportedDependencyService, string[]> = {
  postgres: ["postgres", "postgresql"],
  mysql: ["mysql", "mariadb"],
  mongodb: ["mongodb", "mongo"],
  redis: ["redis"],
};

const SERVICE_ENV: Record<SupportedDependencyService, RegExp[]> = {
  postgres: [/^POSTGRES(QL)?_/i, /^PG(HOST|PORT|USER|PASSWORD|DATABASE|URL)$/i],
  mysql: [/^MYSQL_/i],
  mongodb: [/^MONGO(DB)?_/i, /^MONGO_URI$/i],
  redis: [/^REDIS_/i],
};

const SERVICE_PACKAGES: Record<SupportedDependencyService, string[]> = {
  postgres: ["pg", "postgres", "psycopg", "psycopg2", "asyncpg", "pg-promise", "prisma"],
  mysql: ["mysql", "mysql2", "mysql2/promise", "mysqldb", "pymysql", "aiomysql"],
  mongodb: ["mongodb", "mongoose", "pymongo", "motor"],
  redis: ["redis", "ioredis", "node-redis", "bullmq", "@upstash/redis"],
};

const SERVICE_PORT_ROLES: Record<SupportedDependencyService, string[]> = {
  postgres: ["database"],
  mysql: ["database"],
  mongodb: ["database"],
  redis: ["cache"],
};

function aliasMatches(service: SupportedDependencyService, text: string | null): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return SERVICE_ALIASES[service].some(
    (alias) =>
      normalized === alias ||
      normalized.startsWith(`${alias}-`) ||
      normalized.startsWith(`${alias}_`) ||
      normalized.endsWith(`-${alias}`) ||
      normalized.endsWith(`_${alias}`),
  );
}

function addEvidence(out: Evidence[], evidence: Evidence): void {
  if (!out.some((item) => item.sourcePath === evidence.sourcePath && item.field === evidence.field && item.line === evidence.line)) {
    out.push(evidence);
  }
}

type AliasFlag = {
  path: string[];
  enabled: boolean | null;
  sourcePath: string;
};

function findAliasFlags(values: YamlValue | null, sourcePath: string): { service: SupportedDependencyService; flag: AliasFlag }[] {
  const out: { service: SupportedDependencyService; flag: AliasFlag }[] = [];
  const visit = (value: YamlValue | undefined, path: string[]): void => {
    const record = asRecord(value);
    if (!record) return;
    for (const [key, item] of Object.entries(record)) {
      const next = [...path, key];
      for (const service of Object.keys(SERVICE_ALIASES) as SupportedDependencyService[]) {
        if (key.toLowerCase() === SERVICE_ALIASES[service][0] || SERVICE_ALIASES[service].slice(1).includes(key.toLowerCase())) {
          const enabledRecord = asRecord(item);
          const enabled = enabledRecord && typeof enabledRecord.enabled === "boolean" ? enabledRecord.enabled : null;
          out.push({ service, flag: { path: next, enabled, sourcePath } });
        }
      }
      visit(item, next);
    }
  };
  visit(values ?? null, []);
  return out;
}

function chartValuesPaths(files: Record<string, string | null>): string[] {
  return Object.keys(files).filter((path) => /(^|\/)values\.ya?ml$/i.test(path));
}

function chartDependencyPaths(files: Record<string, string | null>): string[] {
  return Object.keys(files).filter((path) => /(^|\/)(Chart\.ya?ml|requirements\.yaml)$/i.test(path));
}

function helmAssessment(
  service: SupportedDependencyService,
  files: Record<string, string | null>,
  out: Evidence[],
): { tier: DependencyEvidenceTier; summary: string | null; disabled: boolean } {
  let disabled = false;
  let explicitlyEnabled = false;
  let declared = false;
  let used = false;

  for (const path of chartDependencyPaths(files)) {
    const text = files[path];
    if (typeof text !== "string") continue;
    for (const dependency of parseChartDependencies(text)) {
      const names = [dependency.name, dependency.alias].filter((name): name is string => !!name);
      if (!names.some((name) => aliasMatches(service, name))) continue;
      declared = true;
      addEvidence(out, makeEvidence({
        sourcePath: path,
        field: "dependencies",
        evidenceType: "helm_dependency",
        confidence: "medium",
        explanation: `Chart declares ${dependency.alias ?? dependency.name} as a dependency.`,
      }));
      for (const chartPath of chartValuesPaths(files)) {
        const valuesText = files[chartPath];
        if (typeof valuesText !== "string") continue;
        const values = parseYamlDocuments(valuesText)[0]?.value ?? null;
        for (const condition of dependency.conditionPaths) {
          const value = getPath(values, condition);
          if (value === false) {
            disabled = true;
            addEvidence(out, makeEvidence({
              sourcePath: chartPath,
              field: `values.${condition.join(".")}`,
              evidenceType: "helm_value",
              confidence: "high",
              explanation: `Chart values explicitly disable ${condition.join(".")}.`,
            }));
          } else if (value === true) {
            explicitlyEnabled = true;
            addEvidence(out, makeEvidence({
              sourcePath: chartPath,
              field: `values.${condition.join(".")}`,
              evidenceType: "helm_value",
              confidence: "high",
              explanation: `Chart values explicitly enable ${condition.join(".")}.`,
            }));
          }
        }
      }
    }
  }

  for (const path of chartValuesPaths(files)) {
    const text = files[path];
    if (typeof text !== "string") continue;
    const values = parseYamlDocuments(text)[0]?.value ?? null;
    for (const flag of findAliasFlags(values, path)) {
      if (flag.service !== service) continue;
      if (flag.flag.enabled === false) {
        disabled = true;
        addEvidence(out, makeEvidence({
          sourcePath: path,
          field: `values.${flag.flag.path.join(".")}.enabled`,
          evidenceType: "helm_value",
          confidence: "high",
          explanation: `Chart values explicitly disable ${flag.flag.path.join(".")}.`,
        }));
      } else if (flag.flag.enabled === true) {
        explicitlyEnabled = true;
        addEvidence(out, makeEvidence({
          sourcePath: path,
          field: `values.${flag.flag.path.join(".")}.enabled`,
          evidenceType: "helm_value",
          confidence: "high",
          explanation: `Chart values explicitly enable ${flag.flag.path.join(".")}.`,
        }));
      }
    }
  }

  if (!disabled) {
    const chart = Object.keys(files)
      .filter((path) => path.includes("/templates/"))
      .map((path) => loadHelmChart(files, path))
      .find((entry) => entry?.root);
    if (chart) {
      for (const [path, content] of Object.entries(files)) {
        if (!path.startsWith(`${chart.root}/templates/`) || typeof content !== "string") continue;
        const prepared = prepareHelmTemplate(path, content, files).text.toLowerCase();
        if (SERVICE_ALIASES[service].some((alias) => prepared.includes(alias))) {
          used = true;
          addEvidence(out, makeEvidence({
            sourcePath: path,
            evidenceType: "helm_template",
            confidence: "medium",
            explanation: `An active Helm template references ${service}; disabled conditional blocks are omitted before this check.`,
          }));
          break;
        }
      }
    }
  }

  if (disabled) {
    return { tier: "none", summary: `Chart configuration explicitly disables ${service}; an installed dependency or driver does not make it active.`, disabled: true };
  }
  if (explicitlyEnabled && (declared || used)) {
    return { tier: "medium", summary: `Chart configuration explicitly enables ${service} and the chart declares or uses it.`, disabled: false };
  }
  if (declared || explicitlyEnabled || used) {
    return { tier: "weak", summary: `${service} appears in Helm configuration, but no enabled deployment use was established.`, disabled: false };
  }
  return { tier: "none", summary: null, disabled: false };
}

function composeAssessment(
  service: SupportedDependencyService,
  composeServices: ComposeService[],
  objects: K8sObjects,
  out: Evidence[],
): { tier: DependencyEvidenceTier; summary: string | null } {
  const matches = composeServices.filter(
    (candidate) => aliasMatches(service, candidate.name) || aliasMatches(service, candidate.image),
  );
  if (matches.length === 0) return { tier: "none", summary: null };
  for (const match of matches) {
    addEvidence(out, makeEvidence({
      sourcePath: match.path,
      field: `services.${match.name}`,
      evidenceType: "compose_service",
      confidence: "low",
      explanation: `Compose defines a ${match.name} service; presence alone does not prove the application uses it.`,
    }));
  }
  const applications = composeServices.filter((candidate) => candidate.build !== null && candidate.command.length > 0);
  const linked = applications.some((application) =>
    matches.some(
      (match) =>
        application.dependsOn.includes(match.name) || application.referencedServices.includes(match.name),
    ),
  );
  const workloadLinked = objects.workloads.some((workload) =>
    workload.containers.some((container) =>
      container.envValues.some((env) => env.reference && aliasMatches(service, env.reference)),
    ),
  );
  if (linked || workloadLinked) {
    const source = linked ? "Compose application service configuration" : "workload environment configuration";
    return { tier: "strong", summary: `${source} ties ${service} to the application workload.` };
  }
  return { tier: "weak", summary: `${service} has a Compose service, but no application service references it.` };
}

function configurationAssessment(
  service: SupportedDependencyService,
  envNames: string[],
  objects: K8sObjects,
  portFindings: PortFinding[],
  out: Evidence[],
): { tier: DependencyEvidenceTier; summary: string | null } {
  const specific = envNames.filter((name) => SERVICE_ENV[service].some((pattern) => pattern.test(name)));
  if (specific.length > 0) {
    return { tier: "strong", summary: `Service-specific configuration names ${specific.slice(0, 3).join(", ")}.` };
  }
  const workloadReference = objects.workloads.some((workload) =>
    workload.containers.some((container) =>
      container.envValues.some((env) => env.reference && aliasMatches(service, env.reference)),
    ),
  );
  if (workloadReference) {
    return { tier: "strong", summary: `A workload environment references a ${service} host.` };
  }
  const linkedPort = portFindings.some(
    (finding) =>
      SERVICE_PORT_ROLES[service].includes(finding.role) &&
      (finding.evidence.confidence === "high" || finding.evidence.confidence === "medium"),
  );
  if (linkedPort) {
    return { tier: "medium", summary: `Deployment configuration connects a ${service} port to the application topology.` };
  }
  const weakPort = portFindings.some((finding) => SERVICE_PORT_ROLES[service].includes(finding.role));
  if (weakPort) {
    return { tier: "weak", summary: `A ${service} port number appears, but no workload uses it.` };
  }
  return { tier: "none", summary: null };
}

function statusForTier(tier: DependencyEvidenceTier): DependencyStatus {
  if (tier === "strong" || tier === "medium") return "detected";
  if (tier === "weak") return "unknown";
  return "not_detected";
}

function rankTier(tier: DependencyEvidenceTier): number {
  if (tier === "strong") return 3;
  if (tier === "medium") return 2;
  if (tier === "weak") return 1;
  return 0;
}

export function assessDependencies(input: {
  files: Record<string, string | null>;
  objects: K8sObjects;
  composeServices: ComposeService[];
  packages: string[];
  envNames: string[];
  portFindings: PortFinding[];
}): Record<SupportedDependencyService, DependencyFinding> {
  const services = Object.keys(SERVICE_ALIASES) as SupportedDependencyService[];
  const findings = {} as Record<SupportedDependencyService, DependencyFinding>;
  const configuredNames: string[] = [];
  const addName = (name: string): void => {
    if (!configuredNames.includes(name)) configuredNames.push(name);
  };
  for (const name of input.envNames) addName(name);
  for (const service of input.composeServices) {
    for (const name of service.envNames) addName(name);
  }
  for (const workload of input.objects.workloads) {
    for (const container of workload.containers) {
      for (const name of container.envNames) addName(name);
    }
  }
  for (const service of services) {
    const evidence: Evidence[] = [];
    const helm = helmAssessment(service, input.files, evidence);
    if (helm.disabled) {
      findings[service] = {
        service,
        status: "not_detected",
        tier: "none",
        evidence,
        summary: helm.summary ?? `${service} is explicitly disabled.`,
      };
      continue;
    }
    const compose = composeAssessment(service, input.composeServices, input.objects, evidence);
    const configuration = configurationAssessment(service, configuredNames, input.objects, input.portFindings, evidence);
    const packages = SERVICE_PACKAGES[service].some((pkg) => input.packages.includes(pkg.toLowerCase()));
    const ambiguousUrl = configuredNames.some((name) => /^DATABASE_URL$/i.test(name));
    if (ambiguousUrl) {
      addEvidence(evidence, makeEvidence({
        sourcePath: "environment configuration",
        evidenceType: "ambiguous_database_url",
        confidence: "low",
        explanation: "DATABASE_URL names a database without identifying which engine it uses.",
      }));
    }
    if (packages) {
      addEvidence(evidence, makeEvidence({
        sourcePath: "package dependencies",
        evidenceType: "driver_package",
        confidence: "low",
        explanation: `A ${service} client package is installed; that proves capability, not runtime use.`,
      }));
    }
    const tiers: DependencyEvidenceTier[] = [helm.tier, compose.tier, configuration.tier, packages || ambiguousUrl ? "weak" : "none"];
    const tier = tiers.sort((a, b) => rankTier(b) - rankTier(a))[0];
    const summary =
      tier === "strong"
        ? [compose.summary, configuration.summary, helm.summary].find(Boolean) ?? `${service} is tied to the application configuration.`
        : tier === "medium"
          ? [helm.summary, compose.summary, configuration.summary].find(Boolean) ?? `${service} has deployment-level configuration.`
          : tier === "weak"
            ? [helm.summary, compose.summary, configuration.summary].find(Boolean) ??
              (packages
                ? `Only a ${service} driver is installed.`
                : `Only weak ${service} evidence was found.`)
            : `No ${service} evidence was found.`;
    findings[service] = {
      service,
      status: statusForTier(tier),
      tier,
      evidence,
      summary,
    };
  }
  return findings;
}

const GO_DRIVER_MODULES: { module: string; service: SupportedDependencyService }[] = [
  { module: "github.com/lib/pq", service: "postgres" },
  { module: "github.com/jackc/pgx", service: "postgres" },
  { module: "gorm.io/driver/postgres", service: "postgres" },
  { module: "github.com/go-sql-driver/mysql", service: "mysql" },
  { module: "go.mongodb.org/mongo-driver", service: "mongodb" },
  { module: "github.com/gomodule/redigo", service: "redis" },
  { module: "github.com/redis/go-redis", service: "redis" },
];

function goModulePackages(text: string): string[] {
  const out: string[] = [];
  const lines = text.split("\n");
  let inRequire = false;
  for (const raw of lines) {
    const line = raw.split("//", 1)[0].trim();
    if (line === "require (") {
      inRequire = true;
      continue;
    }
    if (inRequire && line === ")") {
      inRequire = false;
      continue;
    }
    const match = /^(?:require\s+)?([^\s]+)\s+v[^\s]+/.exec(line);
    if ((inRequire || line.startsWith("require ")) && match) {
      const mapping = GO_DRIVER_MODULES.find((entry) => match[1] === entry.module || match[1].startsWith(`${entry.module}/`));
      if (mapping) out.push(mapping.service);
    }
  }
  return out;
}

/**
 * Package identifiers that can suggest—but never prove—a runtime dependency.
 * Manifest names from several ecosystems are normalized to the four tracked
 * services; everything else is ignored by dependency assessment.
 */
export function extractManifestPackageNames(files: Record<string, string | null>): string[] {
  const names = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string" || content === "") continue;
    const base = path.split("/").pop() ?? "";
    if (base === "go.mod") {
      for (const name of goModulePackages(content)) names.add(name);
    } else if (base === "Cargo.toml") {
      for (const raw of content.split("\n")) {
        const line = raw.split("#", 1)[0].trim();
        const match = /^([A-Za-z0-9_-]+)\s*=/.exec(line);
        if (match) names.add(match[1].toLowerCase());
      }
    } else if (base === "Gemfile") {
      for (const match of Array.from(content.matchAll(/gem\s+["']([^"']+)["']/g))) names.add(match[1].toLowerCase());
    } else if (base === "composer.json") {
      try {
        const parsed: unknown = JSON.parse(content);
        const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
        const require = record?.require;
        if (typeof require === "object" && require !== null) {
          for (const name of Object.keys(require as Record<string, unknown>)) names.add(name.toLowerCase());
        }
      } catch {
        // Malformed composer metadata is unknown evidence, not an error.
      }
    }
  }
  return Array.from(names);
}

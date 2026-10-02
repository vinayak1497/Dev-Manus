/**
 * Pure repository analysis (no network).
 *
 * Given a map of `path → content` (content may be null when only presence
 * is known), return ONLY what the files actually show. Anything not found
 * is `not_detected` — never guessed.
 *
 * The network layer (`app/api/onboarding/analyze`) builds this file map
 * from the public GitHub API; future adapters (GitLab, Docker, K8s, OTel…)
 * plug in by producing the same map.
 */

import type {
  ApplicationPortSelection,
  DependencyFinding,
  DependencyStatus,
  DetectedCommand,
  Detection,
  Evidence,
  EvidenceConfidence,
  HealthEndpointFinding,
  PortFinding,
  Provenance,
  RepoAnalysis,
  RuntimeCommandFindings,
  SupportedDependencyService,
} from "./types";
import { makeEvidence } from "./evidence";
import {
  composeProductionCommands,
  commandPortsFor,
  dockerBuildCommand,
  dockerProductionCommands,
  kubernetesProductionCommands,
  packageRuntimeCommands,
  productionCommandForStrategy,
} from "./commands";
import { parseComposeServices, parseDockerfile, type ComposeService, type DockerfileInfo } from "./containers";
import { assessDependencies, extractManifestPackageNames } from "./dependencies";
import { bindServicesToWorkloads, extractKubernetesObjects } from "./kubernetes";
import {
  collectCommandPorts,
  collectComposePortFindings,
  collectDockerExposes,
  collectFrameworkPorts,
  collectHelmValuePorts,
  collectKubernetesPortFindings,
  extractFrameworkPorts,
  mergePortFindings,
  selectApplicationPort,
} from "./ports";
import { extractRouteFindings } from "./routes";
import { extractHealthEndpointFindings, probeNumericPorts } from "./health-evidence";
import { lineOf, splitShellWords } from "./manifests";
import { asRecord, type YamlValue } from "./manifests";
import { parseYamlDocuments } from "./yaml";

const MAX_DEPS = 40;
const MAX_FILES_SEEN = 60;

function det<T>(value: T | null, found: boolean): Detection<T> {
  return {
    value: found ? value : null,
    provenance: found ? "detected" : "not_detected",
  };
}

function has(files: Record<string, string | null>, path: string): boolean {
  return Object.prototype.hasOwnProperty.call(files, path);
}

function get(files: Record<string, string | null>, path: string): string {
  return files[path] ?? "";
}

/**
 * Find the most plausible file for a role: prefer the repository root, then
 * the shallowest path, then alphabetical. This is what lets a monorepo's
 * `apps/api/package.json` still be found, while a root file always wins.
 */
function findFirst(
  files: Record<string, string | null>,
  predicate: (path: string, base: string) => boolean,
): string | null {
  const matches: string[] = [];
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    const base = parts[parts.length - 1];
    if (predicate(path, base)) matches.push(path);
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    return da - db || a.localeCompare(b);
  });
  return matches[0];
}

/** Every path matching a predicate, shallowest first (for evidence lists). */
function findAll(
  files: Record<string, string | null>,
  predicate: (path: string, base: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    const base = parts[parts.length - 1];
    if (predicate(path, base)) out.push(path);
  }
  out.sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    return da - db || a.localeCompare(b);
  });
  return out;
}

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseEnvExampleNames(text: string): string[] {
  const names = new Set<string>();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t || t.startsWith("#")) continue;
    // KEY=... / KEY: ... / export KEY=...
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]/.exec(t);
    if (m) names.add(m[1]);
    if (names.size >= 60) break;
  }
  return Array.from(names).sort();
}

function detectNode(
  files: Record<string, string | null>,
): Pick<
  RepoAnalysis,
  "framework" | "language" | "packageManager" | "dependencies" | "scripts"
> & { entryPoints: string[]; packagePath: string | null } {
  const pkgPath = findFirst(files, (_p, base) => base === "package.json");
  const pkgRaw = pkgPath ? get(files, pkgPath) : "";
  const pkg = pkgRaw ? parseJsonSafe(pkgRaw) : null;
  if (!pkg) {
    return {
      framework: det<string>(null, false),
      language: det<string>(null, false),
      packageManager: det<string>(null, false),
      scripts: det<Record<string, string>>(null, false),
      dependencies: [],
      entryPoints: [],
      packagePath: pkgPath,
    };
  }
  const deps = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
  };
  const names = Object.keys(deps);
  let framework: string | null = null;
  if (names.includes("next")) framework = "Next.js";
  else if (names.includes("nuxt")) framework = "Nuxt";
  else if (names.includes("remix") || names.includes("@remix-run/react"))
    framework = "Remix";
  else if (names.includes("astro")) framework = "Astro";
  else if (names.includes("express") || names.includes("fastify") || names.includes("koa") || names.includes("hono") || names.includes("@nestjs/core"))
    framework =
      names.includes("@nestjs/core") ? "NestJS"
      : names.includes("fastify") ? "Fastify"
      : names.includes("koa") ? "Koa"
      : names.includes("hono") ? "Hono"
      : "Express";
  else if (names.includes("react")) framework = "React";
  else if (names.includes("vue")) framework = "Vue";
  else if (names.includes("svelte") || names.includes("@sveltejs/kit"))
    framework = "Svelte";

  let pm: string | null = null;
  // Lockfiles can live in a sub-package of a monorepo, so look for the file
  // rather than the exact root path.
  if (findFirst(files, (_p, b) => b === "pnpm-lock.yaml")) pm = "pnpm";
  else if (findFirst(files, (_p, b) => b === "yarn.lock")) pm = "Yarn";
  else if (findFirst(files, (_p, b) => b === "bun.lockb" || b === "bun.lock")) pm = "Bun";
  else if (findFirst(files, (_p, b) => b === "package-lock.json")) pm = "npm";

  const rawScripts = (pkg.scripts as Record<string, unknown>) ?? {};
  // Keep only real string scripts. `npm run build` is inferred from the
  // package manager + script name, never from the script body.
  const scripts: Record<string, string> = {};
  for (const [name, body] of Object.entries(rawScripts)) {
    if (typeof body === "string" && body.trim() !== "") scripts[name] = body.trim();
  }

  const entryPoints: string[] = [];
  if (typeof scripts.start === "string") entryPoints.push(`npm start (${scripts.start})`);
  else if (typeof scripts.dev === "string") entryPoints.push(`npm run dev (${scripts.dev})`);
  if (typeof pkg.main === "string") entryPoints.push(String(pkg.main));
  for (const p of ["src/index.ts", "src/index.js", "src/main.ts", "src/app.ts", "index.js", "server.js", "app/api", "src/app", "cmd/api/main.go", "main.go"]) {
    if (has(files, p)) {
      entryPoints.push(p);
      continue;
    }
    const base = p.split("/").pop() ?? p;
    const nested = findFirst(files, (_p, b) => b === base);
    if (nested && !entryPoints.includes(nested)) entryPoints.push(nested);
  }

  return {
    framework: det(framework, framework !== null),
    language: det("Node.js", true),
    packageManager: det(pm, pm !== null),
    scripts: det(scripts, Object.keys(scripts).length > 0),
    dependencies: names.slice(0, MAX_DEPS),
    entryPoints: entryPoints.slice(0, 8),
    packagePath: pkgPath,
  };
}

function detectPython(
  files: Record<string, string | null>,
): { framework: Detection<string>; language: Detection<string>; entryPoints: string[]; dependencies: string[] } | null {
  const requirementsPath = findFirst(files, (_p, base) => base === "requirements.txt");
  const pyprojectPath = findFirst(files, (_p, base) => base === "pyproject.toml");
  const pipfilePath = findFirst(files, (_p, base) => base === "Pipfile");
  const appPath = findFirst(files, (_p, base) => base === "app.py");
  const mainPath = findFirst(files, (_p, base) => base === "main.py");
  const hasPy = requirementsPath !== null || pyprojectPath !== null || pipfilePath !== null || appPath !== null || mainPath !== null;
  if (!hasPy) return null;
  const joined =
    (requirementsPath ? get(files, requirementsPath) : "") + "\n" + (pyprojectPath ? get(files, pyprojectPath) : "");
  const lower = joined.toLowerCase();
  let fw: string | null = null;
  if (lower.includes("django")) fw = "Django";
  else if (lower.includes("fastapi")) fw = "FastAPI";
  else if (lower.includes("flask")) fw = "Flask";
  const entryPoints: string[] = [];
  for (const base of ["app.py", "main.py", "wsgi.py", "asgi.py", "src/main.py"]) {
    const found = base.includes("/")
      ? (has(files, base) ? base : null)
      : findFirst(files, (_p, b) => b === base);
    if (found) entryPoints.push(found);
  }
  const deps = joined
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/[=<>;\s]/)[0])
    .filter(Boolean)
    .slice(0, MAX_DEPS);
  return {
    framework: det(fw, fw !== null),
    language: det("Python", true),
    entryPoints,
    dependencies: deps,
  };
}

export function analyzeFileMap(
  files: Record<string, string | null>,
  opts: {
    provider: "github" | "other";
    owner: string | null;
    repo: string | null;
    branch: string;
    truncated?: boolean;
  },
): RepoAnalysis {
  const filesSeen = Object.keys(files).slice(0, MAX_FILES_SEEN);
  const now = new Date().toISOString();
  const evidence: Record<string, Evidence[]> = {};
  const note = (key: string, entries: Evidence[]) => {
    if (entries.length === 0) return;
    const seen = new Set((evidence[key] ?? []).map((item) => `${item.sourcePath}\0${item.field ?? ""}\0${item.line ?? ""}`));
    for (const entry of entries) {
      const id = `${entry.sourcePath}\0${entry.field ?? ""}\0${entry.line ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      evidence[key] = [...(evidence[key] ?? []), entry].slice(0, 8);
    }
  };
  const notePaths = (
    key: string,
    paths: string[],
    input: { evidenceType: string; confidence: EvidenceConfidence; explanation: (path: string) => string; field?: string },
  ) => {
    note(
      key,
      paths.map((path) =>
        makeEvidence({
          sourcePath: path,
          ...(input.field === undefined ? {} : { field: input.field }),
          evidenceType: input.evidenceType,
          confidence: input.confidence,
          explanation: input.explanation(path),
        }),
      ),
    );
  };

  const baseIs = (...names: string[]) => (_p: string, b: string) => names.includes(b);
  const lowerPath = (p: string) => p.toLowerCase();

  const chartValuesPaths = (fileMap: Record<string, string | null>): string[] =>
    Object.keys(fileMap).filter((path) => /(^|\/)values\.ya?ml$/i.test(path));

  /** Dotted value paths disabled by an explicit `enabled: false` parent. */
  const disabledHelmValuePaths = (fileMap: Record<string, string | null>): Set<string> => {
    const disabled = new Set<string>();
    const visit = (value: YamlValue | undefined, path: string[]): void => {
      const recordValue = asRecord(value);
      if (!recordValue) return;
      for (const [key, item] of Object.entries(recordValue)) {
        const next = [...path, key];
        const child = asRecord(item);
        if (child && child.enabled === false) disabled.add(next.join("."));
        visit(item, next);
      }
    };
    for (const path of chartValuesPaths(fileMap)) {
      const content = fileMap[path];
      if (typeof content !== "string") continue;
      visit(parseYamlDocuments(content)[0]?.value ?? null, []);
    }
    return disabled;
  };

  // --- Container / infra evidence, matched at ANY sensible depth ---------
  const dockerfilePaths = findAll(
    files,
    (p, b) => b === "Dockerfile" || b.startsWith("Dockerfile") || b.endsWith(".Dockerfile"),
  ).slice(0, 3);
  const dockerfile = dockerfilePaths.length > 0;

  const composePaths = findAll(files, baseIs(
    "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
  )).slice(0, 3);
  const compose = composePaths.length > 0;

  const objects = extractKubernetesObjects(files);
  const kubernetesPaths = Array.from(
    new Set([
      ...objects.workloads.map((workload) => workload.path),
      ...objects.services.map((service) => service.path),
      ...objects.ingressBackends.map((backend) => backend.path),
      ...objects.configs.map((config) => config.path),
    ]),
  ).slice(0, 4);
  const kubernetes = kubernetesPaths.length > 0;

  const kustomizePaths = findAll(files, baseIs("kustomization.yaml", "kustomization.yml")).slice(0, 3);
  const kustomize = kustomizePaths.length > 0;

  // Helm charts live at `charts/<name>/Chart.yaml`, `helm/<name>/Chart.yaml`,
  // etc. — a root-only check could never see them.
  const helmPaths = findAll(files, baseIs("Chart.yaml", "Chart.yml")).slice(0, 3);
  const helm = helmPaths.length > 0;

  notePaths("dockerfile", dockerfilePaths, {
    evidenceType: "dockerfile",
    confidence: "high",
    field: "Dockerfile",
    explanation: (path) => `Container image build instructions were found at ${path}.`,
  });
  notePaths("compose", composePaths, {
    evidenceType: "compose_file",
    confidence: "high",
    field: "services",
    explanation: (path) => `Composed services were found at ${path}.`,
  });
  notePaths("kubernetes", kubernetesPaths, {
    evidenceType: "kubernetes_manifest",
    confidence: "high",
    field: "kind",
    explanation: (path) => `A Kubernetes object was declared at ${path}.`,
  });
  notePaths("kustomize", kustomizePaths, {
    evidenceType: "kustomization",
    confidence: "high",
    field: "resources",
    explanation: (path) => `Kustomize resources were declared at ${path}.`,
  });
  notePaths("helm", helmPaths, {
    evidenceType: "helm_chart",
    confidence: "high",
    field: "Chart.yaml",
    explanation: (path) => `A Helm chart was declared at ${path}.`,
  });

// Each provider is detected from a concrete path, so keep that path too. A
  // provider name without the file that proves it is only an assertion.
  const ci: string[] = [];
  const ciEvidence: Evidence[] = [];
  const addCi = (provider: string, path: string | null, field: string) => {
    if (!path) return;
    ci.push(provider);
    ciEvidence.push(
      makeEvidence({
        sourcePath: path,
        field,
        evidenceType: "ci_configuration",
        confidence: "high",
        explanation: `${provider} configuration was found at ${path}.`,
      }),
    );
  };
  addCi("GitHub Actions", findFirst(files, (p) => p.startsWith(".github/workflows/")), "workflows");
  addCi("GitLab CI", findFirst(files, baseIs(".gitlab-ci.yml")), ".gitlab-ci.yml");
  addCi("Jenkins", findFirst(files, baseIs("Jenkinsfile")), "Jenkinsfile");
  addCi("CircleCI", findFirst(files, (p) => p.toLowerCase().startsWith(".circleci/")), ".circleci");
  addCi("Azure Pipelines", findFirst(files, baseIs("azure-pipelines.yml")), "azure-pipelines.yml");
  addCi("Bitbucket Pipelines", findFirst(files, baseIs("bitbucket-pipelines.yml")), "bitbucket-pipelines.yml");
  note("ci", ciEvidence);

  const envFiles = Object.keys(files).filter((p) => {
    const b = p.split("/").pop() ?? "";
    return b === ".env.example" || b === ".env.sample" || b === ".env.template";
  });
  const envExample = envFiles.length > 0 ? get(files, envFiles[0]) : "";
  const envVarNames = envExample ? parseEnvExampleNames(envExample) : [];

  const node = detectNode(files);
  const py = detectPython(files);

  let framework = node.framework;
  let language = node.language;
  let packageManager = node.packageManager;
  let scripts = node.scripts;
  let dependencies = node.dependencies;
  let entryPoints = [...node.entryPoints];
  if ((!framework.value || !language.value) && py) {
    if (!framework.value) framework = py.framework;
    if (!language.value) language = py.language;
    dependencies = [...dependencies, ...py.dependencies].slice(0, MAX_DEPS);
    entryPoints = [...entryPoints, ...py.entryPoints].slice(0, 8);
  }
  if (!language.value) {
    if (findFirst(files, baseIs("go.mod"))) language = det("Go", true);
    else if (findFirst(files, baseIs("Cargo.toml"))) language = det("Rust", true);
    else if (findFirst(files, baseIs("Gemfile"))) language = det("Ruby", true);
    else if (findFirst(files, baseIs("composer.json"))) language = det("PHP", true);
    else if (findFirst(files, baseIs("pom.xml", "build.gradle"))) language = det("Java", true);
  }
  const goMod = findFirst(files, baseIs("go.mod"));
  if (goMod) {
    note("language", [
      makeEvidence({
        sourcePath: goMod,
        field: "module",
        evidenceType: "language_manifest",
        confidence: "high",
        explanation: `A Go module was declared at ${goMod}.`,
      }),
    ]);
    if (!entryPoints.some((e) => e.includes("main"))) {
      const goMain = findFirst(files, (_p, b) => b === "main.go");
      if (goMain) entryPoints.push(goMain);
    }
  }

  // Provenance for every remaining detected finding. `note` ignores empty
  // lists, so a "detected" badge is never rendered without a file behind it.
  if (framework.value) {
    const pkg = findFirst(files, (_p, b) => b === "package.json");
    if (pkg) {
      note("framework", [
        makeEvidence({
          sourcePath: pkg,
          field: "dependencies",
          evidenceType: "framework_manifest",
          confidence: "high",
          explanation: `${framework.value} dependencies were declared at ${pkg}.`,
        }),
      ]);
    }
  }
  if (packageManager.value) {
    const lock = findFirst(files, (_p, b) =>
      ["pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock", "package-lock.json"].includes(b),
    );
    if (lock) {
      note("packageManager", [
        makeEvidence({
          sourcePath: lock,
          evidenceType: "lockfile",
          confidence: "high",
          explanation: `${packageManager.value} lockfile was found at ${lock}.`,
        }),
      ]);
    }
  }
  if (language.value && !evidence.language) {
    const byLanguage: Record<string, string[]> = {
      "Node.js": ["package.json"],
      Go: ["go.mod"],
      Rust: ["Cargo.toml"],
      Ruby: ["Gemfile"],
      PHP: ["composer.json"],
      Java: ["pom.xml", "build.gradle"],
      Python: ["pyproject.toml", "requirements.txt", "Pipfile", "setup.py"],
    };
    const names = byLanguage[language.value] ?? [];
    const hit = names.length > 0 ? findFirst(files, (_p, b) => names.includes(b)) : null;
    if (hit) {
      note("language", [
        makeEvidence({
          sourcePath: hit,
          evidenceType: "language_manifest",
          confidence: "high",
          explanation: `${language.value} was declared at ${hit}.`,
        }),
      ]);
    }
  }
  const entryEvidence: Evidence[] = [];
  for (const e of entryPoints) {
    if (has(files, e)) {
      entryEvidence.push(
        makeEvidence({
          sourcePath: e,
          evidenceType: "entry_point",
          confidence: "high",
          explanation: `An application entry point was found at ${e}.`,
        }),
      );
    }
  }
  // `npm start (...)` and `main` are values read out of package.json, so that
  // file is their proof even though the entry point string is not a path.
  const pkgEntry = findFirst(files, (_p, b) => b === "package.json");
  if (pkgEntry && entryPoints.some((e) => !has(files, e))) {
    entryEvidence.push(
      makeEvidence({
        sourcePath: pkgEntry,
        field: "scripts",
        evidenceType: "package_script",
        confidence: "high",
        explanation: `An entry point was read from scripts in ${pkgEntry}.`,
      }),
    );
  }
  note("entryPoints", entryEvidence);

  const bindings = bindServicesToWorkloads(objects);
  const composeServices = parseComposeServices(files);
  const dockerInfos = dockerfilePaths
    .map((path) => parseDockerfile(path, get(files, path)))
    .filter((info): info is DockerfileInfo => info !== null);
  const manifestPackages = extractManifestPackageNames(files);
  const packages = Array.from(
    new Set([...dependencies, ...manifestPackages].map((name) => name.toLowerCase())),
  ).slice(0, MAX_DEPS);
  const packageCommands: RuntimeCommandFindings =
    node.packagePath && scripts.value
      ? packageRuntimeCommands({
          scripts: scripts.value,
          packageManager: packageManager.value,
          sourcePath: node.packagePath,
        })
      : {
          development: { command: null, provenance: "not_detected" },
          build: { command: null, provenance: "not_detected" },
          production: { command: null, provenance: "not_detected" },
        };
  const dockerBuild = dockerBuildCommand(dockerInfos);
  const buildCommand = packageCommands.build.command ? packageCommands.build : dockerBuild.command ? dockerBuild : packageCommands.build;
  const productionCommands = [
    ...kubernetesProductionCommands(objects.workloads, files),
    ...composeProductionCommands(composeServices),
    ...dockerProductionCommands(dockerInfos),
    ...(packageCommands.production.command ? [packageCommands.production] : []),
  ];
  const production = productionCommandForStrategy(productionCommands, null);
  const runtimeCommands: RuntimeCommandFindings = {
    development: packageCommands.development,
    build: buildCommand,
    production,
  };

  const candidateCommandPorts = productionCommands.flatMap((candidate) => {
    if (!candidate.command || !candidate.sourcePath || !candidate.confidence) return [];
    return commandPortsFor(splitShellWords(candidate.command), {
      sourcePath: candidate.sourcePath,
      ...(candidate.field == null ? {} : { field: candidate.field }),
      ...(candidate.line == null ? {} : { line: candidate.line }),
      confidence: candidate.confidence,
      command: candidate.command,
    });
  });
  const frameworkPorts = extractFrameworkPorts(files, language.value);
  const applicationTargets = new Set([
    ...candidateCommandPorts.filter((entry) => entry.role === "application_http" || entry.role === "application_https").map((entry) => entry.port),
    ...frameworkPorts.map((entry) => entry.port),
  ]);
  const helmValueFindings = chartValuesPaths(files).flatMap((path) => {
    const content = files[path];
    if (typeof content !== "string") return [];
    const values = parseYamlDocuments(content)[0]?.value ?? null;
    return collectHelmValuePorts(values, path, disabledHelmValuePaths(files));
  });
  const portFindings = mergePortFindings([
    ...collectKubernetesPortFindings(objects, bindings),
    ...collectComposePortFindings(composeServices, applicationTargets),
    ...collectDockerExposes(dockerInfos),
    ...helmValueFindings,
    ...collectCommandPorts(candidateCommandPorts),
    ...collectFrameworkPorts(frameworkPorts),
  ]);
  const applicationPort = selectApplicationPort(portFindings, probeNumericPorts(objects));
  const routes = extractRouteFindings(files);
  const healthEndpointFindings = extractHealthEndpointFindings(files, objects, routes);
  const healthEndpoints: Detection<HealthEndpointFinding[]> =
    healthEndpointFindings.length > 0
      ? { value: healthEndpointFindings, provenance: "detected" }
      : { value: null, provenance: "not_detected" };
  const dependencyFindings = assessDependencies({
    files,
    objects,
    composeServices,
    packages,
    envNames: envVarNames,
    portFindings,
  });

  note("portFindings", portFindings.map((finding) => finding.evidence));
  note(
    "applicationPort",
    applicationPort.selected.value !== null
      ? portFindings.filter((finding) => finding.port === applicationPort.selected.value).map((finding) => finding.evidence)
      : applicationPort.alternatives.map((finding) => finding.evidence),
  );
  note("healthEndpoints", healthEndpointFindings.map((finding) => finding.evidence));
  const commandEvidence = (command: DetectedCommand, evidenceType: string): Evidence[] =>
    command.command && command.sourcePath && command.confidence
      ? [
          makeEvidence({
            sourcePath: command.sourcePath,
            ...(command.field == null ? {} : { field: command.field }),
            ...(command.line == null ? {} : { line: command.line }),
            evidenceType,
            confidence: command.confidence,
            explanation: command.explanation ?? `A runtime command was found at ${command.sourcePath}.`,
          }),
        ]
      : [];
  note("runtimeCommandDevelopment", commandEvidence(runtimeCommands.development, "runtime_command"));
  note("runtimeCommandBuild", commandEvidence(runtimeCommands.build, "runtime_command"));
  note("runtimeCommandProduction", commandEvidence(runtimeCommands.production, "runtime_command"));
  note(
    "productionCommands",
    productionCommands.flatMap((command) =>
      command.command && command.sourcePath && command.confidence
        ? [
            makeEvidence({
              sourcePath: command.sourcePath,
              ...(command.field == null ? {} : { field: command.field }),
              ...(command.line == null ? {} : { line: command.line }),
              evidenceType: "production_command",
              confidence: command.confidence,
              explanation: command.explanation ?? `A production command was found at ${command.sourcePath}.`,
            }),
          ]
        : [],
    ),
  );
  note(
    "dependencyFindings",
    (Object.values(dependencyFindings) as DependencyFinding[]).flatMap((finding) => finding.evidence),
  );

  return {
    status: "ready",
    reason: null,
    failure: null,
    evidence,
    truncated: opts.truncated === true,
    provider: opts.provider,
    owner: opts.owner,
    repo: opts.repo,
    branch: opts.branch,
    reachable: true,
    framework,
    language,
    packageManager,
    scripts,
    dependencies,
    dockerfile: det(dockerfile ? true : null, dockerfile),
    compose: det(compose ? true : null, compose),
    kubernetes: det(kubernetes ? true : null, kubernetes),
    kustomize: det(kustomize ? true : null, kustomize),
    helm: det(helm ? true : null, helm),
    ci,
    envFiles,
    envVarNames,
    entryPoints,
    portFindings,
    applicationPort,
    runtimeCommands,
    productionCommands,
    healthEndpoints,
    dependencyFindings,
    filesSeen,
    analyzedAt: now,
  };
}

export function unavailableAnalysis(
  opts: { provider: "github" | "other"; owner: string | null; repo: string | null; branch: string },
  reason: string,
): RepoAnalysis {
  const u: Provenance = "unavailable";
  const none = <T>(): Detection<T> => ({ value: null, provenance: u });
  return {
    status: "unavailable",
    reason,
    failure: "repo_unreachable",
    evidence: {},
    truncated: false,
    provider: opts.provider,
    owner: opts.owner,
    repo: opts.repo,
    branch: opts.branch,
    reachable: false,
    framework: none(),
    language: none(),
    packageManager: none(),
    scripts: none(),
    dependencies: [],
    dockerfile: none(),
    compose: none(),
    kubernetes: none(),
    kustomize: none(),
    helm: none(),
    ci: [],
    envFiles: [],
    envVarNames: [],
    entryPoints: [],
    portFindings: [],
    applicationPort: {
      selected: { value: null, provenance: u },
      alternatives: [],
      ambiguous: false,
    },
    runtimeCommands: {
      development: { command: null, provenance: u },
      build: { command: null, provenance: u },
      production: { command: null, provenance: u },
    },
    productionCommands: [],
    healthEndpoints: none(),
    dependencyFindings: {
      postgres: { service: "postgres", status: "unknown", tier: "none", evidence: [], summary: "Analysis did not run." },
      mysql: { service: "mysql", status: "unknown", tier: "none", evidence: [], summary: "Analysis did not run." },
      mongodb: { service: "mongodb", status: "unknown", tier: "none", evidence: [], summary: "Analysis did not run." },
      redis: { service: "redis", status: "unknown", tier: "none", evidence: [], summary: "Analysis did not run." },
    },
    filesSeen: [],
    analyzedAt: new Date().toISOString(),
  };
}


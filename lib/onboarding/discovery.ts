/**
 * Bounded repository discovery — pure functions, no network.
 *
 * The previous implementation probed a flat, ROOT-ONLY allowlist
 * (`ANALYSIS_CANDIDATE_PATHS`). That can never see `charts/app/Chart.yaml`,
 * `kustomize/deployment.yaml`, `manifests/service.yaml` and so on, so a
 * perfectly well-configured repository reported Helm/Kubernetes as "Not
 * detected".
 *
 * This module instead takes ONE repository tree (from the GitHub trees API)
 * and chooses a small, prioritised, bounded set of files to actually read.
 * It never fetches the whole repository:
 *   - ignored directories (`.git`, `node_modules`, `vendor`, build output…)
 *   - a maximum depth
 *   - a maximum file count
 *   - a maximum per-file size
 *   - a total content budget
 */
import type { TreeEntry } from "./types";

export type DiscoveryLimits = {
  /** Maximum path segments considered (root file = 1). */
  maxDepth: number;
  /** Maximum number of files handed to the content fetcher. */
  maxFiles: number;
  /** Files larger than this are listed but not downloaded. */
  maxFileBytes: number;
  /** Hard ceiling on bytes fetched across all files. */
  maxTotalBytes: number;
};

export const DEFAULT_LIMITS: DiscoveryLimits = {
  maxDepth: 5,
  maxFiles: 120,
  maxFileBytes: 400_000,
  maxTotalBytes: 3_000_000,
};

/** Directories that never contain first-party configuration evidence. */
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".tox",
  ".gradle",
  ".terraform",
  ".idea",
  ".vscode",
  "bower_components",
  "jspm_packages",
  ".yarn",
  "site-packages",
  "Godeps",
  "third_party",
  "thirdparty",
]);

/** Binary / generated extensions we never need to read. */
const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".svg",
  ".pdf", ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".jar", ".war",
  ".mp3", ".mp4", ".mov", ".avi", ".wav", ".ogg", ".webm",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".so", ".dylib", ".dll", ".exe", ".bin", ".o", ".a", ".class", ".pyc",
  ".wasm", ".node", ".lock.png",
]);

/** Exact filenames that are strong evidence, highest priority. */
const HIGH_PRIORITY_FILES = new Set([
  "package.json",
  "go.mod",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "Chart.yaml",
  "Chart.yml",
  "kustomization.yaml",
  "kustomization.yml",
  "Procfile",
  "Jenkinsfile",
  "main.go",
  "app.py",
  "main.py",
]);

/** Path prefixes worth reading when present at any reasonable depth. */
const INFRA_PREFIXES = [
  "charts/",
  "helm/",
  "kustomize/",
  "kustomizations/",
  "overlays/",
  "base/",
  "manifests/",
  "k8s/",
  "kubernetes/",
  "deploy/",
  "deployment/",
  "infra/",
  "infrastructure/",
  ".github/workflows/",
  ".gitlab/",
  ".circleci/",
];

const BASE_NAMES = new Set([
  "values.yaml",
  "values.yml",
  "deployment.yaml",
  "deployment.yml",
  "service.yaml",
  "service.yml",
  "statefulset.yaml",
  "statefulset.yml",
  "ingress.yaml",
  "ingress.yml",
  "configmap.yaml",
  "configmap.yml",
  "kustomization.yaml",
  "kustomization.yml",
  "Chart.yaml",
  "Chart.yml",
  "skaffold.yaml",
  "skaffold.yml",
]);

const TEXT_EXTENSIONS = new Set([
  ".yaml", ".yml", ".json", ".toml", ".mod", ".sum", ".ini", ".cfg",
  ".conf", ".env", ".example", ".sample", ".template", ".tf", ".tfvars",
  ".gradle", ".properties", ".xml", ".txt", ".go", ".py", ".rb", ".php",
  ".sh", ".bash", ".dockerfile", ".makefile", ".mk", "",
]);

function depthOf(path: string): number {
  return path.split("/").length;
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function extensionOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf(".");
  // Dotfiles like `.env.example` → treat ".example" as the extension.
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

function isIgnoredPath(path: string): boolean {
  const segments = path.split("/");
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (IGNORED_DIRS.has(segments[i])) return true;
  }
  const ext = extensionOf(path);
  if (ext && IGNORED_EXTENSIONS.has(ext)) return true;
  return false;
}

/** Lower is more interesting. `null` means "not worth downloading". */
function scorePath(path: string): number | null {
  if (isIgnoredPath(path)) return null;
  const base = baseName(path);
  const lower = path.toLowerCase();
  const depth = depthOf(path);

  if (HIGH_PRIORITY_FILES.has(base)) return 0;

  // `Dockerfile.prod`, `app.Dockerfile`, `go.mod` inside a sub-module.
  if (base.startsWith("Dockerfile") || base.endsWith(".Dockerfile")) {
    return depth <= 2 ? 1 : 4;
  }
  if (base.startsWith(".env")) return 2;
  if (base.endsWith(".env.example") || base.endsWith(".env.sample")) return 2;

  for (let i = 0; i < INFRA_PREFIXES.length; i += 1) {
    if (lower.startsWith(INFRA_PREFIXES[i])) {
      // Infra manifests matter most, but only a few levels down.
      if (depth > 4) return 6;
      return BASE_NAMES.has(base) ? 1 : 3;
    }
  }
  if (BASE_NAMES.has(base)) return 3;

  // Language / build metadata anywhere sensible.
  const ext = extensionOf(path);
  if (TEXT_EXTENSIONS.has(ext)) {
    if (depth === 1) return 3;
    if (ext === ".yaml" || ext === ".yml" || ext === ".toml" || ext === ".json") {
      return depth <= 3 ? 5 : 7;
    }
    return 6;
  }
  // Lockfiles are huge and rarely decisive — skip them.
  if (/\.lock$|lock\.json$|lock\.yaml$/.test(base)) return null;
  return null;
}

export type DiscoveryResult = {
  /** Paths to download, highest priority first. */
  selected: string[];
  /** Paths that looked relevant but exceeded the size budget. */
  tooLarge: string[];
  /** Paths that looked relevant but exceeded the count/depth budget. */
  droppedForBudget: number;
  /** Every candidate we recognised, before limits. */
  candidates: number;
};

/**
 * Choose which files to read. Deterministic: ties break on path so repeated
 * runs analyse the same repository identically.
 */
export function selectFiles(
  entries: TreeEntry[],
  limits: DiscoveryLimits = DEFAULT_LIMITS,
): DiscoveryResult {
  const scored: { path: string; score: number; size: number }[] = [];

  for (const entry of entries) {
    if (entry.type !== "blob") continue;
    if (depthOf(entry.path) > limits.maxDepth) continue;
    const score = scorePath(entry.path);
    if (score === null) continue;
    scored.push({ path: entry.path, score, size: entry.size ?? 0 });
  }

  scored.sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path));

  const selected: string[] = [];
  const tooLarge: string[] = [];
  let total = 0;
  let droppedForBudget = 0;

  for (const item of scored) {
    if (selected.length >= limits.maxFiles) {
      droppedForBudget += 1;
      continue;
    }
    if (item.size > limits.maxFileBytes) {
      tooLarge.push(item.path);
      continue;
    }
    if (total + item.size > limits.maxTotalBytes) {
      droppedForBudget += 1;
      continue;
    }
    total += item.size;
    selected.push(item.path);
  }

  return {
    selected,
    tooLarge,
    droppedForBudget,
    candidates: scored.length,
  };
}
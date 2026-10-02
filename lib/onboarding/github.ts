/**
 * GitHub repository analysis — the only module that touches the network.
 *
 * Two architectural rules live here:
 *
 * 1. **Bounded discovery, not a fixed root file list.** One `git/trees` call
 *    describes the repository; `discovery.ts` then picks a small prioritised
 *    subset. Content is fetched from `raw.githubusercontent.com` (a CDN) rather
 *    than one API call per file, which cuts API quota usage by roughly an order
 *    of magnitude and removes the failure mode where a 25-file probe loop
 *    exhausted the quota and every file came back "missing".
 *
 * 2. **Failures are classified, never flattened into "no files found".** A
 *    rate-limit, a missing branch and a genuinely empty repository are three
 *    different outcomes and the UI must say which one happened.
 *
 * The network is injected (`GithubDeps`) so every branch can be unit-tested
 * without calling GitHub.
 */
import { selectFiles, DEFAULT_LIMITS, type DiscoveryLimits } from "./discovery";
import { analyzeFileMap } from "./analyze";
import type {
  AnalysisFailure,
  RepoAnalysis,
  TreeEntry,
} from "./types";
import { parseRepoUrl } from "./validation";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const TREE_TIMEOUT_MS = 12_000;
const FILE_TIMEOUT_MS = 8_000;
const FILE_CONCURRENCY = 8;
const MAX_FILE_CHARS = 400_000;

export const FAILURE_MESSAGE: Record<AnalysisFailure, string> = {
  no_url: "No repository URL was provided. You can continue with manual configuration.",
  unsupported_host:
    "Automatic analysis supports public GitHub repositories in this build. Other hosts need manual configuration.",
  repo_unreachable:
    "That repository wasn't found, or it isn't public. You can continue with manual configuration.",
  branch_not_found:
    "That branch doesn't exist in this repository. Check the branch name, or continue with manual configuration.",
  rate_limited:
    "GitHub is rate limiting analysis requests right now. Wait a moment and try again — this does not mean your repository is empty.",
  read_failed:
    "The repository was listed but its files could not be downloaded. Try again, or continue with manual configuration.",
};

export type HttpResult<T> = {
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  body: T;
};

export type GithubDeps = {
  /** GET a JSON endpoint (api.github.com). */
  fetchJson: (url: string) => Promise<HttpResult<unknown>>;
  /** GET a plain-text file (raw.githubusercontent.com). */
  fetchText: (url: string) => Promise<{ status: number; body: string | null }>;
  limits?: DiscoveryLimits;
};

/** True when GitHub is telling us the quota is gone, not that a file is absent. */
export function isRateLimited(status: number, headers: Record<string, string>): boolean {
  if (status === 429) return true;
  if (status !== 403 && status !== 401) return false;
  const remaining = headers["x-ratelimit-remaining"];
  if (remaining === "0") return true;
  // Secondary limits also answer 403 with a body we can sniff.
  const body = headers["x-probe-body"];
  if (typeof body === "string" && /rate limit|abuse/i.test(body)) return true;
  return false;
}

export function unavailable(
  opts: { provider: "github" | "other"; owner: string | null; repo: string | null; branch: string },
  failure: AnalysisFailure,
  reason?: string,
): RepoAnalysis {
  return {
    status: "unavailable",
    reason: reason ?? FAILURE_MESSAGE[failure],
    failure,
    provider: opts.provider,
    owner: opts.owner,
    repo: opts.repo,
    branch: opts.branch,
    reachable: failure !== "repo_unreachable",
    evidence: {},
    truncated: false,
    framework: none(),
    language: none(),
    packageManager: none(),
    scripts: none(),
    dependencies: [],
    dockerfile: none(),
    compose: none(),
    kubernetes: none(),
    helm: none(),
    kustomize: none(),
    ci: [],
    envFiles: [],
    envVarNames: [],
    entryPoints: [],
    portFindings: [],
    applicationPort: {
      selected: { value: null, provenance: "unavailable" },
      alternatives: [],
      ambiguous: false,
    },
    runtimeCommands: {
      development: { command: null, provenance: "unavailable" },
      build: { command: null, provenance: "unavailable" },
      production: { command: null, provenance: "unavailable" },
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

function none<T>(): { value: T | null; provenance: "unavailable" } {
  return { value: null, provenance: "unavailable" };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return out;
}

export type AnalyzeOptions = {
  repositoryUrl: string;
  branch?: string;
};

/**
 * Analyse a public GitHub repository from evidence.
 *
 * Returns `status: "ready"` whenever the repository could actually be read —
 * including when it was read and contained nothing we recognise. Only genuine
 * read failures produce `status: "unavailable"`.
 */
export async function analyzePublicRepository(
  opts: AnalyzeOptions,
  deps: GithubDeps,
): Promise<RepoAnalysis> {
  const url = (opts.repositoryUrl ?? "").trim();
  const branchInput = (opts.branch ?? "").trim();
  const limits = deps.limits ?? DEFAULT_LIMITS;

  if (!url) {
    return unavailable({ provider: "other", owner: null, repo: null, branch: branchInput }, "no_url");
  }

  const parsed = parseRepoUrl(url);
  if (parsed.provider !== "github" || !parsed.owner || !parsed.repo) {
    return unavailable({ provider: "other", owner: null, repo: null, branch: branchInput }, "unsupported_host");
  }

  const owner = parsed.owner;
  const repo = parsed.repo;

  // 1. Does the repository exist, and what is its default branch?
  let defaultBranch = "main";
  try {
    const meta = await deps.fetchJson(`${API}/repos/${owner}/${repo}`);
    if (meta.status === 404) {
      return unavailable({ provider: "github", owner, repo, branch: branchInput }, "repo_unreachable");
    }
    if (isRateLimited(meta.status, meta.headers)) {
      return unavailable({ provider: "github", owner, repo, branch: branchInput }, "rate_limited");
    }
    if (meta.status >= 400) {
      return unavailable({ provider: "github", owner, repo, branch: branchInput }, "repo_unreachable");
    }
    const body = meta.body as { default_branch?: unknown } | null;
    if (body && typeof body.default_branch === "string" && body.default_branch) {
      defaultBranch = body.default_branch;
    }
  } catch {
    return unavailable({ provider: "github", owner, repo, branch: branchInput }, "repo_unreachable");
  }

  const branch = branchInput || defaultBranch;

  // 2. One recursive tree call describes the whole repository.
  let tree: TreeEntry[];
  let truncated = false;
  try {
    const res = await deps.fetchJson(
      `${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    if (res.status === 404) {
      // The repository exists (step 1 proved it), so this ref does not.
      return unavailable({ provider: "github", owner, repo, branch }, "branch_not_found");
    }
    if (isRateLimited(res.status, res.headers)) {
      return unavailable({ provider: "github", owner, repo, branch }, "rate_limited");
    }
    if (res.status >= 400) {
      return unavailable({ provider: "github", owner, repo, branch }, "repo_unreachable");
    }
    const body = res.body as { tree?: unknown; truncated?: unknown } | null;
    const raw = Array.isArray(body?.tree) ? body?.tree : [];
    tree = raw
      .filter((e): e is { path: string; type: string; size?: number } =>
        !!e && typeof (e as { path?: unknown }).path === "string",
      )
      .map((e) => ({
        path: e.path,
        type: (e.type === "tree" ? "tree" : e.type === "commit" ? "commit" : "blob") as TreeEntry["type"],
        size: typeof e.size === "number" ? e.size : undefined,
      }));
    truncated = body?.truncated === true;
  } catch {
    return unavailable({ provider: "github", owner, repo, branch }, "repo_unreachable");
  }

  // 3. Choose a small, prioritised, bounded set of files to actually read.
  const discovery = selectFiles(tree, limits);

  // A repository we could list but that contains nothing we recognise is a
  // SUCCESS with no findings — never "analysis unavailable".
  if (discovery.selected.length === 0) {
    return analyzeFileMap({}, {
      provider: "github",
      owner,
      repo,
      branch,
      truncated,
    });
  }

  // 4. Download just those files. Raw CDN first (no API quota), API fallback.
  const contents = await mapWithConcurrency(
    discovery.selected,
    FILE_CONCURRENCY,
    async (path): Promise<string | null> => {
      try {
        const raw = await deps.fetchText(
          `${RAW}/${owner}/${repo}/${encodeURIComponent(branch)}/${encodePath(path)}`,
        );
        if (raw.status === 200 && typeof raw.body === "string") {
          return raw.body.slice(0, MAX_FILE_CHARS);
        }
      } catch {
        // fall through to the API
      }
      try {
        const res = await deps.fetchJson(
          `${API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
        );
        if (res.status !== 200) return null;
        const body = res.body as { content?: unknown; encoding?: unknown } | null;
        if (typeof body?.content !== "string") return null;
        const decoded =
          body.encoding === "base64"
            ? Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf-8")
            : body.content;
        return decoded.slice(0, MAX_FILE_CHARS);
      } catch {
        return null;
      }
    },
  );

  const files: Record<string, string | null> = {};
  let downloaded = 0;
  for (let i = 0; i < discovery.selected.length; i += 1) {
    const content = contents[i];
    if (typeof content === "string") {
      files[discovery.selected[i]] = content;
      downloaded += 1;
    }
  }

  // We could list the repository but read none of it — that IS a failure.
  if (downloaded === 0) {
    return unavailable({ provider: "github", owner, repo, branch }, "read_failed");
  }

  return analyzeFileMap(files, {
    provider: "github",
    owner,
    repo,
    branch,
    truncated,
  });
}

export const __testing = { TREE_TIMEOUT_MS, FILE_TIMEOUT_MS, FILE_CONCURRENCY, encodePath };